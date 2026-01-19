-- 1. Schema Changes (Profiles)
-- Add new point columns
ALTER TABLE profiles 
ADD COLUMN purchased_points BIGINT DEFAULT 0,
ADD COLUMN earned_points BIGINT DEFAULT 0;

-- Migrate existing points to purchased_points
-- (Assuming 'points' was a mix, but user requested to move all to purchased for now)
UPDATE profiles 
SET purchased_points = points;

-- (Optional) Drop original points column or keep it sync?
-- For safety, let's keep it for now but stop using it in logic, or drop it if user is sure.
-- User said: "기존 컬럼은 정리해줘" -> We will drop it to avoid confusion.
ALTER TABLE profiles DROP COLUMN points;


-- 2. New Tables

-- Settlement Requests
CREATE TABLE settlement_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
    admin_memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Point Transactions (Audit Log)
CREATE TABLE point_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('charge', 'purchase', 'sale', 'settlement_request', 'settlement_refund', 'settlement_completed')),
    amount BIGINT NOT NULL, -- Change amount (can be negative for deductions, or we use absolute and infer from type) -> Let's use signed integer.
    description TEXT,
    related_id UUID, -- Payment ID, or Purchase ID, or Settlement Request ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 3. RPC Functions (Transactions)

-- Function 1: Purchase Exam Material (Atomic Transaction)
CREATE OR REPLACE FUNCTION purchase_exam_material(
    buyer_id UUID,
    seller_id UUID,
    price BIGINT,
    exam_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    buyer_purchased BIGINT;
    buyer_earned BIGINT;
    deduct_purchased BIGINT := 0;
    deduct_earned BIGINT := 0;
    remaining_price BIGINT := price;
    seller_profit BIGINT;
    new_purchase_id UUID;
BEGIN
    -- 1. Check Buyer Balance (Lock row)
    SELECT purchased_points, earned_points INTO buyer_purchased, buyer_earned
    FROM profiles
    WHERE id = buyer_id
    FOR UPDATE;

    IF (buyer_purchased + buyer_earned) < price THEN
        RETURN jsonb_build_object('success', false, 'message', '잔액이 부족합니다.');
    END IF;

    -- 2. Calculate Deductions (Priority: Purchased > Earned)
    IF buyer_purchased >= remaining_price THEN
        deduct_purchased := remaining_price;
        remaining_price := 0;
    ELSE
        deduct_purchased := buyer_purchased;
        remaining_price := remaining_price - buyer_purchased;
        deduct_earned := remaining_price;
    END IF;

    -- 3. Deduct from Buyer
    UPDATE profiles
    SET purchased_points = purchased_points - deduct_purchased,
        earned_points = earned_points - deduct_earned
    WHERE id = buyer_id;

    -- Log Buyer Transaction
    INSERT INTO point_transactions (user_id, type, amount, description, related_id)
    VALUES (buyer_id, 'purchase', -price, '자료 구매', exam_id);


    -- 4. Add to Seller (30% Fee, Floor Rounding)
    seller_profit := FLOOR(price * 0.7);

    UPDATE profiles
    SET earned_points = earned_points + seller_profit
    WHERE id = seller_id;

    -- Log Seller Transaction
    INSERT INTO point_transactions (user_id, type, amount, description, related_id)
    VALUES (seller_id, 'sale', seller_profit, '자료 판매 수익 (수수료 30% 제외)', exam_id);


    -- 5. Create Purchase Record
    INSERT INTO purchases (user_id, exam_id, price)
    VALUES (buyer_id, exam_id, price)
    RETURNING id INTO new_purchase_id;

    -- 6. Increment Sales Count (Optional, if you have this column)
    UPDATE exam_materials
    SET sales_count = COALESCE(sales_count, 0) + 1
    WHERE id = exam_id;

    RETURN jsonb_build_object('success', true, 'purchase_id', new_purchase_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;


-- Function 2: Request Settlement (Atomic)
CREATE OR REPLACE FUNCTION request_settlement(
    p_user_id UUID,
    p_amount BIGINT,
    p_bank_name TEXT,
    p_account_number TEXT,
    p_account_holder TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_earned BIGINT;
    new_request_id UUID;
BEGIN
    -- Check Balance
    SELECT earned_points INTO current_earned
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF current_earned < p_amount THEN
        RETURN jsonb_build_object('success', false, 'message', '출금 가능한 수익 포인트가 부족합니다.');
    END IF;

    -- Deduct Points
    UPDATE profiles
    SET earned_points = earned_points - p_amount
    WHERE id = p_user_id;

    -- Create Request
    INSERT INTO settlement_requests (user_id, amount, bank_name, account_number, account_holder)
    VALUES (p_user_id, p_amount, p_bank_name, p_account_number, p_account_holder)
    RETURNING id INTO new_request_id;

    -- Log Transaction
    INSERT INTO point_transactions (user_id, type, amount, description, related_id)
    VALUES (p_user_id, 'settlement_request', -p_amount, '정산 요청 (포인트 차감)', new_request_id);

    RETURN jsonb_build_object('success', true, 'request_id', new_request_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;


-- Function 3: Process Settlement (Admin Only - Logic for Reject Refund)
CREATE OR REPLACE FUNCTION process_settlement(
    p_request_id UUID,
    p_new_status TEXT, -- 'completed' or 'rejected'
    p_admin_memo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    req_record RECORD;
BEGIN
    -- Get Request Info
    SELECT * INTO req_record
    FROM settlement_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request not found');
    END IF;

    IF req_record.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request is already processed');
    END IF;

    -- 1. Update Status
    UPDATE settlement_requests
    SET status = p_new_status,
        admin_memo = p_admin_memo,
        processed_at = NOW()
    WHERE id = p_request_id;

    -- 2. Refund Logic if Rejected
    IF p_new_status = 'rejected' THEN
        UPDATE profiles
        SET earned_points = earned_points + req_record.amount
        WHERE id = req_record.user_id;

        -- Log Transaction
        INSERT INTO point_transactions (user_id, type, amount, description, related_id)
        VALUES (req_record.user_id, 'settlement_refund', req_record.amount, '정산 거절 환불', p_request_id);
    ELSE
         -- Log Completion (Optional, no money move here, just marking)
        INSERT INTO point_transactions (user_id, type, amount, description, related_id)
        VALUES (req_record.user_id, 'settlement_completed', 0, '정산 완료', p_request_id);
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

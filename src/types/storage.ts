export type Folder = {
    id: string;
    user_id: string;
    parent_id: string | null;
    name: string;
    created_at: string;
};

export type StorageItemType = 'personal_db' | 'saved_exam';

export type UserItem = {
    id: string;
    folder_id: string;
    user_id: string;
    type: StorageItemType;
    reference_id: string; // ID of the referenced item
    name: string | null;  // Optional override name
    created_at: string;
    // Joined data (optional)
    details?: any;
};

export type FolderContent = {
    folders: Folder[];
    items: UserItem[];
};

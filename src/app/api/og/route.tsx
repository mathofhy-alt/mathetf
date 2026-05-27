import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '1200px',
                    height: '630px',
                    background: 'linear-gradient(135deg, #1E2D4F 0%, #0f1d35 60%, #1a3a5c 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '70px 80px',
                    fontFamily: 'sans-serif',
                    position: 'relative',
                }}
            >
                {/* 배경 장식 원 */}
                <div style={{
                    position: 'absolute',
                    top: '-100px',
                    right: '-100px',
                    width: '500px',
                    height: '500px',
                    borderRadius: '50%',
                    background: 'rgba(73, 122, 183, 0.15)',
                    display: 'flex',
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: '-80px',
                    left: '300px',
                    width: '350px',
                    height: '350px',
                    borderRadius: '50%',
                    background: 'rgba(92, 198, 195, 0.1)',
                    display: 'flex',
                }} />

                {/* 로고 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '40px',
                }}>
                    <div style={{
                        background: '#497AB7',
                        borderRadius: '12px',
                        padding: '8px 18px',
                        color: 'white',
                        fontSize: '22px',
                        fontWeight: '900',
                        letterSpacing: '-0.5px',
                        display: 'flex',
                    }}>
                        수학ETF
                    </div>
                    <div style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '18px',
                        display: 'flex',
                    }}>
                        mathetf.com
                    </div>
                </div>

                {/* 메인 헤드라인 */}
                <div style={{
                    color: 'white',
                    fontSize: '64px',
                    fontWeight: '900',
                    lineHeight: '1.15',
                    letterSpacing: '-2px',
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <span>내 시험지,</span>
                    <span style={{ color: '#5CC6C3' }}>내가 직접 출제한다.</span>
                </div>

                {/* 서브 설명 */}
                <div style={{
                    color: 'rgba(255,255,255,0.65)',
                    fontSize: '26px',
                    fontWeight: '400',
                    letterSpacing: '-0.5px',
                    display: 'flex',
                    gap: '24px',
                }}>
                    <span>✓ 기출문제 DB</span>
                    <span>✓ AI 자동 출제</span>
                    <span>✓ HWP·PDF 다운로드</span>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    );
}

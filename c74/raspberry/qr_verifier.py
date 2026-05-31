import cv2
import numpy as np
import requests
from pyzbar.pyzbar import decode
import time
import json

API_URL = "http://localhost:3000/api"

class QRCodeVerifier:
    def __init__(self):
        self.cap = cv2.VideoCapture(0)
        self.cap.set(3, 640)
        self.cap.set(4, 480)
        self.last_scan_time = 0
        self.scan_cooldown = 3
        
    def verify_qr_code(self, encrypted_data):
        try:
            response = requests.post(
                f"{API_URL}/bookings/verify",
                json={"encryptedData": encrypted_data},
                timeout=5
            )
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def run(self):
        print("会议室验证系统启动...")
        print("等待扫描二维码...")
        
        while True:
            success, img = self.cap.read()
            
            for barcode in decode(img):
                my_data = barcode.data.decode('utf-8')
                current_time = time.time()
                
                if current_time - self.last_scan_time > self.scan_cooldown:
                    print(f"\n检测到二维码，正在验证...")
                    
                    result = self.verify_qr_code(my_data)
                    
                    if result.get('success'):
                        booking = result.get('booking', {})
                        print("✅ 验证成功！")
                        print(f"会议室: {booking.get('roomId', {}).get('name', '未知')}")
                        print(f"预订时间: {booking.get('startTime', '未知')}")
                        
                        pts = np.array([barcode.polygon], np.int32)
                        pts = pts.reshape((-1, 1, 2))
                        cv2.polylines(img, [pts], True, (0, 255, 0), 5)
                        
                        org = (barcode.rect[0], barcode.rect[1])
                        cv2.putText(img, 'Verified', org, cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                    else:
                        print("❌ 验证失败:", result.get('error', '未知错误'))
                        
                        pts = np.array([barcode.polygon], np.int32)
                        pts = pts.reshape((-1, 1, 2))
                        cv2.polylines(img, [pts], True, (0, 0, 255), 5)
                        
                        org = (barcode.rect[0], barcode.rect[1])
                        cv2.putText(img, 'Failed', org, cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    
                    self.last_scan_time = current_time
            
            cv2.imshow('会议室验证系统', img)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        self.cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    verifier = QRCodeVerifier()
    try:
        verifier.run()
    except KeyboardInterrupt:
        print("\n系统已停止")
    except Exception as e:
        print(f"错误: {e}")
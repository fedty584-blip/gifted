# ระบบเช็คชื่อทำเวรนักเรียน

เว็บ static เก็บข้อมูลเป็นไฟล์ `data/data.json` ใน GitHub ของคุณเอง

## ติดตั้ง (ทำครั้งเดียว)

1. สร้าง repository บน GitHub แล้วอัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้
2. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / root → Save
   เว็บจะอยู่ที่ `https://ชื่อบัญชี.github.io/ชื่อ-repo/` (รอ 1–2 นาที)
3. สร้าง Token: GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
   - Repository access: Only select repositories → เลือก repo นี้
   - Permissions → **Contents: Read and write**
   - คัดลอก token (`github_pat_...`)
4. เปิด `https://ชื่อบัญชี.github.io/ชื่อ-repo/setup.html`
   ใส่ repo, token และตั้งชื่อผู้ใช้/รหัสผ่านของครู (สูงสุด 3 คน) → กด "สร้างไฟล์ auth.json" → คัดลอก
5. ใน repo: โฟลเดอร์ `data` → Add file → Create new file → ชื่อ `auth.json` → วางข้อความ → Commit

เสร็จแล้ว! กดปุ่ม "แอดมิน" มุมขวาบน กรอกชื่อผู้ใช้/รหัสผ่าน ใช้งานได้เลย (เครื่องจะจำการล็อกอินไว้)

## วิธีทำงาน

- ผู้ใช้ทั่วไปดูได้อย่างเดียว / แอดมินเช็คชื่อและแก้ไขได้ ทุกการแก้ไขบันทึกลง `data/data.json` อัตโนมัติ
- Token ถูกเข้ารหัสด้วยรหัสผ่านของครูแต่ละคน เก็บใน `auth.json` ไม่มีรหัสผ่านหรือ token แบบอ่านออกในโค้ด
- เปลี่ยนรหัสผ่านหรือเพิ่มครู: เปิด setup.html สร้าง auth.json ใหม่ แล้วแทนที่ไฟล์เดิม

## ข้อควรระวัง

- รหัสผ่านควรยาว 8 ตัวขึ้นไป รหัสตัวเลข 4 หลักถูกเดาได้ง่ายถ้ามีคนโหลด auth.json ไปลอง
- repo แบบ public ทำให้ใครก็ดู `data.json` (ชื่อนักเรียน) ได้
- แอดมิน 2 คนบันทึกพร้อมกัน ข้อมูลคนหลังจะทับคนแรก
- ทดสอบในเครื่อง: รัน `python3 -m http.server 8000` ในโฟลเดอร์นี้ แล้วเข้า http://localhost:8000 (ใส่ repo ใน `js/config.js` ก่อน)

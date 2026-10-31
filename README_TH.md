# BSRU Workshop

เว็บไซต์ข่าวประชาสัมพันธ์ กิจกรรมอบรม และระบบสมาชิก ใช้ Node.js, Vercel และ Supabase PostgreSQL

หน้าแรกเปิดอ่านประกาศและกิจกรรมได้ทั่วไป ปุ่ม **Login** ด้านบนเปิด Modal สำหรับเข้าสู่ระบบ
ใน Modal มีทางไปสมัครสมาชิกและลืมรหัสผ่าน หลังล็อกอินจะแสดงพื้นที่ผู้เรียนหรือเจ้าหน้าที่ตามสิทธิ์

## เริ่มพัฒนา

ใช้ Node.js 22.13 ขึ้นไปในสาย 22.x หรือ 24.x แล้วรันใน PowerShell:

```powershell
npm.cmd ci
# หากยังไม่มี .env ให้คัดลอก .env.example แล้วใส่ DATABASE_URL จริง
npm.cmd run db:status
npm.cmd run db:setup
npm.cmd run dev
```

เปิด URL ที่ terminal แสดง ปกติเป็น http://127.0.0.1:8001
ไม่สร้างบัญชีหรือกิจกรรมสาธิตอัตโนมัติ และไม่ใช้ SQLite เป็น runtime

## แก้ข้อความประกาศหน้าแรก

แก้รายการ `announcements` และฟังก์ชัน `home()` ใน `public/assets/js/views/activities.js`
ประกาศเป็นเนื้อหาในหน้าเว็บตามขอบเขตปัจจุบัน ยังไม่มีหน้าจัดการประกาศ
ส่วนกิจกรรมที่กำลังมาถึงอ่านจากฐานข้อมูลจริง

## โครงสร้าง

| ตำแหน่ง | หน้าที่ |
|---|---|
| `api/index.js`, `server.js` | รับคำขอ Vercel และเปิดเซิร์ฟเวอร์บนเครื่อง |
| `src/app.js`, `src/config.js` | ประกอบระบบและตั้งค่า |
| `src/core/` | HTTP, static files และฟังก์ชันร่วม |
| `src/database/` | PostgreSQL adapter และ connection pool |
| `src/features/membership/` | สมัคร ล็อกอิน บัญชี SMTP และกู้รหัสผ่าน |
| `src/features/workshops/` | กิจกรรม ลงทะเบียน เช็กชื่อ และข้อมูลพื้นที่ใช้งาน |
| `public/assets/js/views/` | หน้าสาธารณะ สมาชิก และเจ้าหน้าที่ |
| `public/assets/css/` | base, components และ management styles |
| `database/` | schema เดียวและ CA certificate |
| `scripts/`, `tests/`, `docs/` | เครื่องมือ ทดสอบ และคู่มือ |

## สมาชิกและรหัสผ่าน

สมัครด้วยอีเมลทั่วไป เช่น Gmail, Outlook, อีเมลองค์กร หรืออีเมลมหาวิทยาลัย รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่/เล็ก ตัวเลข และสัญลักษณ์
บัญชีใหม่เป็นผู้ใช้ทั่วไป เจ้าของระบบกำหนดสิทธิ์เจ้าหน้าที่ในฐานข้อมูลได้
การกู้รหัสผ่านต้องตั้ง SMTP; การสมัครและล็อกอินทำงานได้แม้ยังไม่ตั้ง SMTP

ระบบใช้ hash ตรวจล็อกอิน และเก็บสำเนารหัสผ่านจริงใน `users.password_plaintext` ตามคำขอ
API ไม่ส่งรหัสผ่านหรือ hash ออกไป ข้อมูล session เก็บ token แบบ hash ในฐานข้อมูล

## คำสั่งตรวจสอบ

- `npm.cmd test`: ทดสอบฐานข้อมูล API และ DOM/ES modules โดยแยกจาก Supabase จริง
- `npm.cmd run check`: ตรวจไวยากรณ์ JavaScript
- `npm.cmd run format:check`: ตรวจรูปแบบโค้ด
- `npm.cmd run db:setup`: เพิ่มตารางและคอลัมน์ที่ขาดโดยคงข้อมูลเดิม

การทดสอบ ES modules ผ่าน Node.js VM มี experimental warning เฉพาะตอนทดสอบ

## เอกสาร

- [รันบนเครื่องและ deploy](docs/DEPLOYMENT_TH.md)
- [ฐานข้อมูลและ API](docs/DATABASE_TH.md)
- [รายละเอียดโครงสร้างและรายการไฟล์ที่แก้](docs/STRUCTURE_TH.md)

SQLite ต้นทางอยู่ใน `storage/` และสำเนาก่อนจัดโครงสร้างอยู่ใน `.refactor-backups/20261101-000908/`
สองโฟลเดอร์นี้ไม่ถูกส่งขึ้น Vercel

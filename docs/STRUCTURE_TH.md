# โครงสร้างและรายการเปลี่ยนแปลง

## ขอบเขตปัจจุบันตามที่ผู้ใช้แก้ไข

คงระบบสมัครสมาชิกและล็อกอินไว้ เปลี่ยน UI หน้าแรกเป็นประกาศ/ประชาสัมพันธ์ทั่วไป
ปุ่ม Login ด้านบนเปิด Modal ที่เข้าสู่ระบบ สมัครสมาชิก และกู้รหัสผ่านได้
เมื่อเข้าสู่ระบบแสดงพื้นที่ผู้เรียนหรือเจ้าหน้าที่ตามสิทธิ์เดิม
ประกาศใส่เนื้อหาในหน้าเว็บก่อน ยังไม่มีหน้าจัดการประกาศ
หน้าแรกสาธารณะใช้กรอบความกว้างเดียวกับ Navbar มีประกาศตัวอย่างพร้อมภาพใน `activities.js` และแถบเลื่อนกิจกรรมจริงที่ยังเปิดรับ เรียงตามเวลาที่เพิ่มกิจกรรม ไม่มีหน้ากิจกรรมแยกสำหรับผู้ที่ยังไม่ล็อกอิน ส่วนหน้าค้นหากิจกรรมของสมาชิกยังคงอยู่
ใช้ Vercel และ Supabase PostgreSQL และเก็บรหัสผ่านจริงในตารางตามคำขอเดิม

## โครงสร้าง

```text
api/index.js                  ตัวรับคำขอ Vercel
server.js                     ตัวเปิดพอร์ตบนเครื่อง
src/app.js                    ประกอบ API สาธารณะ สมาชิก และกิจกรรม
src/config.js                 อ่าน .env และตั้งค่าระบบ
src/core/http.js              HTTP, cookie, static files และ origin
src/core/utils.js             เวลา ข้อมูล public profile และ password hashing
src/database/                 PostgreSQL adapter และ connection pool
src/features/membership/      สมัคร ล็อกอิน บัญชี SMTP และ OTP recovery
src/features/workshops/       catalog, API จัดการ, store และวงจรถังขยะคำร้อง
public/assets/js/app.js       ประกอบหน้าเว็บและจัดการ session/navigation
public/assets/js/views/       activities, records, management, membership และตัวเลือกวัน/เวลา
public/assets/css/            base, components, management และ records
database/schema.sql           schema และการเพิ่มคอลัมน์/ตารางอย่างเข้ากันได้
tests/                        การทดสอบพฤติกรรม
docs/                         คู่มือปัจจุบัน
```

หน้า root ของ `src` มีเพียง app และ config
แยกสมาชิกเป็นสองไฟล์ เพราะขั้นตอนกู้รหัสผ่านมี transaction และการจำกัดการลองที่ควรดูแลแยกจาก login/signup
รวม SMTP, session, signup และ account routes ไว้ใน membership/index.js
หน้าเว็บใช้ factory รับ context จาก app โดยไม่มี circular imports

## ไฟล์ที่แก้ในรอบกู้ระบบสมาชิกและเปลี่ยนหน้าแรก

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `src/app.js` | เปิดสมาชิกและ API ส่วนตัวกลับมา พร้อมตรวจ session/สิทธิ์ |
| `src/features/membership/index.js` (เพิ่ม) | รวมสมัคร ล็อกอิน ออกจากระบบ ข้อมูลบัญชี cookie/session และ SMTP |
| `src/features/membership/recovery.js` (เพิ่ม) | กู้รหัสผ่าน OTP แบบมีอายุ จำกัดการลอง และยกเลิก session หลังรีเซ็ต |
| `src/core/http.js` | คืนตัวอ่าน cookie |
| `src/core/utils.js` | คืน hash, salt และฟังก์ชันตรวจรหัสผ่าน |
| `src/config.js` | คืนอายุ session |
| `src/features/workshops/management.js` | ปรับคำอธิบายให้ตรงกับ API ที่เปิดใช้งานแล้ว |
| `database/schema.sql` | เพิ่ม password hash/salt, sessions, OTP, reset grants และ login attempts โดยคงข้อมูลเดิม |
| `public/assets/js/app.js` | เชื่อม Modal, session restore, logout, navigation และพื้นที่สมาชิก/เจ้าหน้าที่ |
| `public/assets/js/views/activities.js` | หน้าแรกใหม่ ข้อความประกาศ และทางเข้าสมัครกิจกรรม |
| `public/assets/js/views/membership.js` (เพิ่ม) | Modal Login/สมัคร/กู้รหัสผ่าน และเมนูบัญชี |
| `public/assets/js/views/management.js` | คืนหน้าอนุมัติสมาชิก |
| `public/assets/css/components.css` | สไตล์หน้าแรกและ Modal รองรับมือถือ |
| `scripts/database.js` | ตรวจความพร้อมของตารางสมาชิกด้วย |
| `.env.example` | เพิ่มตัวอย่างค่าตั้ง SMTP โดยไม่แก้ credential จริง |
| `package.json`, `package-lock.json` | คืน dependency nodemailer สำหรับ SMTP |
| `tests/membership.test.js` (เพิ่ม) | ทดสอบสมัคร ล็อกอิน สิทธิ์ logout OTP และการจำกัดการลอง |
| `tests/public-ui.test.js` | ทดสอบหน้าแรก Modal สมัคร/ล็อกอิน logout และพื้นที่เจ้าหน้าที่ |
| `tests/public-catalog.test.js`, `tests/database.test.js` | เปลี่ยนข้อกำหนดให้รองรับระบบสมาชิกที่กู้กลับมา |
| `tests/helpers/management-app.js` | ปรับคำอธิบาย fixture ทดสอบ |
| `README_TH.md`, `docs/DATABASE_TH.md`, `docs/DEPLOYMENT_TH.md`, `docs/STRUCTURE_TH.md` | อัปเดตคู่มือให้ตรงกับระบบที่เปิดใช้ |

## ข้อมูลและข้อจำกัด

ไม่สร้างบัญชีสาธิตหรือเปลี่ยนข้อมูลสมาชิกเดิมระหว่างเริ่มแอป
การสมัครและรีเซ็ตรหัสผ่านบันทึก hash และสำเนารหัสผ่านจริงใน transaction เดียวกัน
API และ snapshots ใช้ข้อมูล profile ที่ตัดคอลัมน์รหัสผ่านออก
การส่ง OTP จริงต้องตั้ง SMTP ใน environment
ยังไม่ได้ deploy ไป Vercel

## ผลตรวจรอบนี้

- `npm.cmd test`: ผ่าน 23 ข้อ รวมสมัคร/ล็อกอิน/ออกจากระบบ, OTP, สิทธิ์, Modal และพื้นที่เจ้าหน้าที่
- `npm.cmd run check`: ผ่าน 35 ไฟล์ JavaScript
- `npm.cmd run format:check`: ผ่าน
- Supabase: ตารางที่ต้องใช้พร้อมครบ และ API session/catalog ตอบ 200; ผู้ไม่มี session เข้า `/api/store` ได้สถานะ 401
- SMTP ใน environment ปัจจุบันยังไม่ได้ตั้ง จึงยังไม่ส่ง OTP จริง
- เครื่องมือเบราว์เซอร์ไม่มี session ให้เชื่อมต่อ การตรวจ UI รอบนี้ใช้ DOM และ ES modules ยังไม่ได้ตรวจภาพในเบราว์เซอร์จริง

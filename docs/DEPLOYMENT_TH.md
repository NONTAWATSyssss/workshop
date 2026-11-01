# รันบนเครื่องและ deploy ไป Vercel

ระบบใช้ PostgreSQL บน Supabase ทั้งสองสภาพแวดล้อม พร้อมระบบสมัครสมาชิกและเข้าสู่ระบบ

## รันบนเครื่อง

1. ใช้ Node.js 22.13 ขึ้นไปในสาย 22.x หรือ 24.x
2. ติดตั้งด้วย `npm.cmd ci` ใน PowerShell
3. คัดลอก `.env.example` เป็น `.env`
4. ใส่ `DATABASE_URL` จริงจากหน้า **Connect** ของโปรเจกต์ Supabase
5. รัน `npm.cmd run db:status` เพื่อตรวจการเชื่อมต่อ
6. ฐานข้อมูลใหม่ให้รัน `npm.cmd run db:setup` แล้ว `npm.cmd run dev`
7. เปิด URL ที่ terminal แสดง ปกติเป็น `http://127.0.0.1:8001`

ใช้ `npm` แทน `npm.cmd` ได้บน macOS/Linux ส่วน `start-local.bat` ยังคงใช้เปิดเว็บบน Windows ได้
การเริ่มแอปจะตรวจสร้างตารางที่ขาดเช่นเดียวกับ `db:setup` แต่ไม่สร้างสมาชิกหรือข้อมูลสาธิต
ถ้าฐานข้อมูลยังไม่มีข้อมูล หน้ารายการจะแสดงสถานะว่าง

## การเชื่อมต่อ Supabase

สำหรับ Vercel เลือก **Transaction pooler** จากหน้า Connect และใช้ connection string ที่หน้านั้นแสดง
สำหรับการพัฒนาบนเครื่องใช้ Session pooler ได้ โดยเฉพาะเครือข่าย IPv4
โค้ดใช้ parameterized queries โดยไม่ตั้งชื่อ prepared statement จึงใช้ transaction pooler ได้
รายละเอียดตาม [เอกสาร Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

ใส่รหัสผ่านฐานข้อมูลลงใน connection string และ URL-encode อักขระพิเศษตามจำเป็น
โปรเจกต์ตรวจ TLS และมี CA ใน `database/certs/`; กำหนด `DATABASE_CA_FILE` หรือ `DATABASE_CA_CERT` หากต้องใช้ CA อื่น
สมาชิกใช้ระบบรหัสผ่านของแอปเอง ไม่ได้ใช้ Supabase Auth

## การสมัครสมาชิกและกู้รหัสผ่าน

สมัครสมาชิกด้วยอีเมลที่ใช้งานและรหัสผ่าน โดยไม่จำกัดโดเมนอีเมล แล้วเข้าสู่ระบบผ่านปุ่ม Login บนหน้าแรก
สมาชิกใหม่ได้รับสิทธิ์ผู้ใช้ทั่วไป แม้จะเลือกประเภทบุคคลเป็นเจ้าหน้าที่
เจ้าของฐานข้อมูลกำหนด `users.role='staff'` ให้บัญชีเจ้าหน้าที่ที่ตรวจสอบแล้วได้
ไม่มีการสร้างบัญชีผู้ดูแลหรือรหัสผ่านสาธิตอัตโนมัติ

การสมัครและล็อกอินไม่ต้องตั้งค่าอีเมล ส่วนการลืม/เปลี่ยนรหัสผ่านใช้ OTP ทาง SMTP
ตั้ง `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` และ `SMTP_FROM` ตามผู้ให้บริการอีเมล
หากยังไม่ตั้ง SMTP หน้าเว็บจะแจ้งให้ติดต่อผู้ดูแลเมื่อขอกู้รหัสผ่าน โดยการสมัครและล็อกอินยังใช้งานได้

## Vercel

1. นำ source เข้าโปรเจกต์ Vercel และใช้การตั้งค่าจาก `vercel.json`
2. ตั้ง `DATABASE_URL` ใน Environment Variables ของ environment ที่ต้องการ deploy
3. เลือก Node.js ให้ตรงกับ `package.json`
4. ตั้ง `APP_ORIGIN` เพิ่มได้เมื่อต้องการจำกัด origin เป็นโดเมนหลักโดยเฉพาะ
5. Deploy แล้วตรวจ `/api/health` และ `/api/workshops`

หน้าเว็บอยู่ใน `public/`; คำขอ `/api/*` ไปที่ `api/index.js`
schema และ CA ถูกรวมในฟังก์ชันผ่าน `includeFiles`
ตัวรับคำขอ Vercel แยกจากตัวฟังพอร์ตบนเครื่อง ตามรูปแบบ [Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)

ใช้ระบบสมัครด้วยอีเมล/รหัสผ่าน จึงไม่ต้องตั้ง `REGISTRATION_PROVIDER`, Firebase, Resend หรือ `BOOTSTRAP_ADMIN_*`
ตั้ง SMTP เพิ่มเมื่อต้องการเปิด OTP สำหรับกู้รหัสผ่าน

## ถังขยะคำร้องและงานล้างอัตโนมัติ

ผู้เรียนย้ายคำร้องไปถังขยะและกู้คืนได้ภายใน 15 วันจากการย้ายครั้งแรก หลังครบกำหนดระบบไม่ส่งคำร้องนั้นให้บัญชีผู้เรียนอีก ส่วนเจ้าหน้าที่ยังเห็นจนกด Clear เอง ข้อมูลคำร้องและคำตอบจะลบจากฐานข้อมูลเมื่อทั้งสองฝั่งลบแล้ว การ Clear ทั้งหมดหมายถึงคำร้องทั้งหมดของฝั่งเจ้าหน้าที่ รวมรายการนอกหน้าปัจจุบันและนอกตัวกรองด้วย

`vercel.json` ตั้งงาน `GET /api/maintenance/complaints` วันละครั้งเวลา 20:00 UTC (03:00 น. ไทย) ให้ตั้ง `CRON_SECRET` เป็นค่าสุ่มส่วนตัวอย่างน้อย 32 ตัวอักษรใน Environment Variables ของ Production ก่อน deploy เพื่อให้ Vercel ส่ง `Authorization: Bearer ...` ได้ ตาม [เอกสารการรักษาความปลอดภัย Cron Jobs ของ Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)

การหมดสิทธิ์กู้คืนใช้เวลาเซิร์ฟเวอร์และมีผลทันทีที่ครบ 15 วัน ไม่ต้องรอรอบ Cron ส่วนการล้างข้อมูลกลางที่ทั้งสองฝั่งลบแล้วทำผ่านงานประจำวันและเมื่อโหลดข้อมูลระบบ บนเครื่องไม่มี Vercel Cron จึงตรวจล้างเมื่อมีการเรียกข้อมูลระบบด้วยเช่นกัน

คอลัมน์คำร้อง `learner_trashed_at`, `learner_deleted_at`, `staff_cleared_at` เพิ่มด้วย `ALTER ... IF NOT EXISTS` ระหว่างเริ่มแอปหรือ `db:setup` โดยเก็บคำร้องเดิมไว้ ไม่มีการแปลงคำร้องเดิมเป็นรายการที่ถูกลบ

ชุดทดสอบใช้ PGlite เพื่อแยกจากข้อมูลจริง ส่วน schema และ API ตรวจการเชื่อมต่อกับ Supabase ตามค่าที่ตั้งไว้ใน `.env`
ยังไม่ได้ deploy เว็บไซต์ไป Vercel

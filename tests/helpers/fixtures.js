"use strict";
// Deterministic domain fixtures; never loaded by the application.
module.exports = async function seed(db) {
  const now = () => new Date().toISOString();
  if ((await db.prepare("SELECT count(*) n FROM users").get()).n) return;
  const addUser =
    db.prepare(`INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const users = [
    [
      "student",
      "นักศึกษาตัวอย่าง",
      "นักศึกษา",
      "STD-DEMO",
      "std_demo@bsru.ac.th",
      "0812345678",
      "คณะวิทยาศาสตร์และเทคโนโลยี",
      "วิทยาการคอมพิวเตอร์ (วท.บ.)",
      "APPROVED",
      "user",
    ],
    [
      "teacher",
      "อาจารย์ตัวอย่าง",
      "อาจารย์",
      "TCH-DEMO",
      "staff_demo@bsru.ac.th",
      "0899990002",
      "คณะครุศาสตร์",
      "คอมพิวเตอร์ศึกษา (ค.บ.)",
      "APPROVED",
      "user",
    ],
    [
      "admin",
      "ผู้ดูแลระบบ BSRU",
      "เจ้าหน้าที่",
      "ADMIN-01",
      "admin1@bsru.ac.th",
      "0899990001",
      "สำนักคอมพิวเตอร์",
      "งานบริหารระบบ",
      "APPROVED",
      "staff",
    ],
  ];
  for (const user of users) {
    await addUser.run(...user, now());
  }
  const insertWorkshop =
    db.prepare(`INSERT INTO workshops(id,title,description,cover,start_at,end_at,place,capacity,hours,closed,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const date = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const samples = [
    [
      "w1",
      "ปลดล็อกไอเดีย สร้างสรรค์งานด้วย Generative AI",
      "เรียนรู้เครื่องมือ AI และฝึกออกแบบผลงานจริง เปิดพื้นที่ให้ทุกไอเดียเป็นไปได้",
      "",
      3,
      9,
      16,
      "ห้องปฏิบัติการคอมพิวเตอร์ อาคาร 28",
      40,
      6,
    ],
    [
      "w2",
      "ออกแบบสื่อให้น่าสนใจด้วย Canva",
      "เปลี่ยนเรื่องราวเป็นงานออกแบบที่สื่อสารได้อย่างมืออาชีพ",
      "",
      7,
      9,
      12,
      "ศูนย์การเรียนรู้ ชั้น 3",
      30,
      3,
    ],
    [
      "w3",
      "เริ่มต้นวิเคราะห์ข้อมูลด้วย Excel",
      "จัดการข้อมูล สร้างสูตร และต่อยอดทักษะการทำงานยุคดิจิทัล",
      "",
      10,
      13,
      16,
      "ห้องคอมพิวเตอร์ 2831",
      35,
      3,
    ],
    [
      "w4",
      "ทักษะการนำเสนอและสื่อสารอย่างมั่นใจ",
      "ฝึกนำเสนอแนวคิดและสื่อสารอย่างมีประสิทธิภาพ",
      "",
      -7,
      9,
      14,
      "ห้องประชุม อาคาร 27",
      50,
      4,
    ],
    [
      "w5",
      "พื้นฐานการถ่ายภาพด้วยสมาร์ตโฟน",
      "เรียนรู้แสง มุมภาพ และการเล่าเรื่องผ่านภาพถ่าย",
      "",
      -14,
      9,
      12,
      "ศูนย์การเรียนรู้ ชั้น 2",
      30,
      3,
    ],
  ];
  for (const [
    id,
    title,
    description,
    cover,
    days,
    startHour,
    endHour,
    place,
    capacity,
    hours,
  ] of samples) {
    await insertWorkshop.run(
      id,
      title,
      description,
      cover,
      date(days, startHour),
      date(days, endHour),
      place,
      capacity,
      hours,
      db.boolean(false),
      now(),
    );
  }
  const reg = db.prepare(
    "INSERT INTO registrations(id,user_id,workshop_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  );
  for (const [id, userId, workshopId, status, days] of [
    ["demo-r1", "student", "w1", "PENDING", 0],
    ["demo-r2", "student", "w4", "ATTENDED", -7],
    ["demo-r3", "student", "w5", "ABSENT", -14],
    ["demo-r4", "student", "w2", "CANCELLED", -1],
    ["demo-r5", "teacher", "w4", "ATTENDED", -7],
  ])
    await reg.run(
      id,
      userId,
      workshopId,
      status,
      date(days, 8),
      date(days, 15),
    );
};

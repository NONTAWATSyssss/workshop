"use strict";
// Explicit one-time data operation. Never runs during server startup or deployment.
const {
  readJson,
  localDateInput,
  validCover,
  uid,
  now,
} = require("../src/core/utils");
const samples = [
  {
    id: "sample-web-fundamentals-202611",
    title: "สร้างเว็บไซต์แรกด้วย HTML และ CSS",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nเรียนรู้โครงสร้างหน้าเว็บ จัดวางเนื้อหา และตกแต่งด้วย CSS พร้อมลงมือสร้างหน้าแนะนำตัวที่รองรับมือถือ เหมาะสำหรับผู้เริ่มต้น ไม่จำเป็นต้องมีพื้นฐานการเขียนโปรแกรม กรุณาเตรียมโน้ตบุ๊กของตนเอง",
    cover: "/assets/images/image-003.jpg",
    start: "2026-11-14T09:00:00+07:00",
    end: "2026-11-14T12:00:00+07:00",
    place: "ห้องปฏิบัติการคอมพิวเตอร์ (ตัวอย่าง)",
    capacity: 30,
    hours: 3,
  },
  {
    id: "sample-creative-design-202611",
    title: "ออกแบบสื่อให้น่าสนใจด้วย Canva",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nฝึกเลือกสี จัดลำดับข้อความ และวางองค์ประกอบภาพเพื่อสร้างโปสเตอร์ประชาสัมพันธ์ พร้อมทดลองออกแบบสื่อของตนเองและแลกเปลี่ยนความคิดเห็นกับเพื่อน กรุณาเตรียมโน้ตบุ๊กและบัญชี Canva ที่ใช้งานอยู่",
    cover: "/assets/images/image-005.jpg",
    start: "2026-11-18T13:00:00+07:00",
    end: "2026-11-18T16:00:00+07:00",
    place: "ห้องอบรมสื่อสร้างสรรค์ (ตัวอย่าง)",
    capacity: 25,
    hours: 3,
  },
  {
    id: "sample-mobile-photography-202611",
    title: "ถ่ายภาพเล่าเรื่องด้วยสมาร์ตโฟน",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nเรียนรู้การใช้แสง การจัดองค์ประกอบ และการเลือกมุมภาพ ผ่านโจทย์ถ่ายภาพสิ่งรอบตัวด้วยสมาร์ตโฟน พร้อมฝึกแต่งภาพเบื้องต้นและนำเสนอเรื่องราวของตนเอง กรุณาเตรียมสมาร์ตโฟนที่สามารถถ่ายภาพได้",
    cover: "/assets/images/image-004.jpg",
    start: "2026-11-21T09:00:00+07:00",
    end: "2026-11-21T12:00:00+07:00",
    place: "พื้นที่กิจกรรมสร้างสรรค์ (ตัวอย่าง)",
    capacity: 20,
    hours: 3,
  },
  {
    id: "sample-ai-productivity-202611",
    title: "ใช้ AI ช่วยวางแผนการเรียนและทำงาน",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nทดลองใช้ AI ช่วยระดมความคิด จัดตารางงาน และร่างเนื้อหา พร้อมฝึกตรวจสอบคำตอบและเลือกใช้อย่างเหมาะสม ผู้เข้าร่วมจะได้จัดทำแผนการเรียนหรือแผนงานของตนเอง กรุณาเตรียมโน้ตบุ๊กหรือแท็บเล็ต",
    cover: "/assets/images/image-002.jpg",
    start: "2026-11-25T13:00:00+07:00",
    end: "2026-11-25T16:00:00+07:00",
    place: "ห้องเรียนรู้ดิจิทัล (ตัวอย่าง)",
    capacity: 30,
    hours: 3,
  },
];

// Additional batch requested separately; --additional never recreates the first batch.
// Cover photos: https://images.unsplash.com/<photo-id> (downloaded locally, 960x600).
const additionalSamples = [
  {
    id: "sample-data-analysis-202611",
    title: "เปลี่ยนข้อมูลให้เป็นเรื่องง่ายด้วย Excel",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nฝึกจัดระเบียบข้อมูล ใช้สูตรพื้นฐาน สรุปผลด้วย PivotTable และสร้างกราฟสำหรับนำเสนอ ผ่านชุดข้อมูลจำลองที่นำไปประยุกต์ใช้กับการเรียนและการทำงานได้ กรุณาเตรียมโน้ตบุ๊กที่ติดตั้ง Excel หรือโปรแกรมตารางคำนวณ",
    // Unsplash photo-1551288049-bebda4e38f71
    cover: "/assets/images/workshop-data-analysis.jpg",
    start: "2026-11-28T09:00:00+07:00",
    end: "2026-11-28T12:00:00+07:00",
    place: "ห้องปฏิบัติการข้อมูล อาคารเรียนรู้ดิจิทัล (ตัวอย่าง)",
    capacity: 30,
    hours: 3,
  },
  {
    id: "sample-cyber-safety-202612",
    title: "รู้ทันภัยไซเบอร์ ปกป้องตัวตนในโลกออนไลน์",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nเรียนรู้การสังเกตข้อความหลอกลวง เว็บไซต์ปลอม และความเสี่ยงจากการเปิดเผยข้อมูลส่วนตัว พร้อมฝึกตั้งค่าความปลอดภัยของบัญชีและการยืนยันตัวตนสองขั้นตอน ผ่านสถานการณ์จำลองที่ปลอดภัย กรุณาเตรียมสมาร์ตโฟนหรือโน้ตบุ๊ก",
    // Unsplash photo-1550751827-4bd374c3f58b
    cover: "/assets/images/workshop-cyber-safety.jpg",
    start: "2026-12-02T13:00:00+07:00",
    end: "2026-12-02T16:00:00+07:00",
    place: "ห้องอบรมความปลอดภัยดิจิทัล (ตัวอย่าง)",
    capacity: 35,
    hours: 3,
  },
  {
    id: "sample-public-speaking-202612",
    title: "พูดอย่างมั่นใจ นำเสนอไอเดียให้คนจดจำ",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nฝึกเรียบเรียงประเด็น เปิดเรื่องให้น่าสนใจ ใช้น้ำเสียงและภาษากายอย่างเหมาะสม พร้อมทดลองนำเสนอไอเดียสั้น ๆ และรับข้อเสนอแนะจากกลุ่ม เหมาะสำหรับผู้ที่ต้องการเพิ่มความมั่นใจในการพูดหน้าชั้นเรียนหรือที่ประชุม",
    // Unsplash photo-1475721027785-f74eccf877e2
    cover: "/assets/images/workshop-public-speaking.jpg",
    start: "2026-12-05T09:00:00+07:00",
    end: "2026-12-05T12:00:00+07:00",
    place: "ห้องกิจกรรมพัฒนาทักษะการสื่อสาร (ตัวอย่าง)",
    capacity: 20,
    hours: 3,
  },
  {
    id: "sample-ux-design-202612",
    title: "ออกแบบประสบการณ์ผู้ใช้ เริ่มต้น UX/UI",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nทำความเข้าใจปัญหาของผู้ใช้ วางเส้นทางการใช้งาน และร่างหน้าจอแอปด้วย Wireframe พร้อมสร้างต้นแบบอย่างง่ายเพื่อนำมาทดลองและปรับปรุง เหมาะสำหรับผู้เริ่มต้นที่สนใจงานออกแบบผลิตภัณฑ์ดิจิทัล กรุณาเตรียมโน้ตบุ๊ก",
    // Unsplash photo-1581291518857-4e27b48ff24e
    cover: "/assets/images/workshop-ux-design.jpg",
    start: "2026-12-09T13:00:00+07:00",
    end: "2026-12-09T16:00:00+07:00",
    place: "ห้องออกแบบนวัตกรรมและประสบการณ์ผู้ใช้ (ตัวอย่าง)",
    capacity: 25,
    hours: 3,
  },
  {
    id: "sample-video-editing-202612",
    title: "เล่าเรื่องผ่านวิดีโอ ตัดต่อคลิปสั้นให้โดดเด่น",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nวางแผนเรื่องราว เลือกช็อต ตัดต่อภาพ ใส่คำบรรยาย และจัดระดับเสียงสำหรับคลิปสั้น พร้อมทดลองสร้างวิดีโอผลงานของตนเองและเรียนรู้การเลือกใช้สื่อที่มีสิทธิ์ใช้งาน กรุณาเตรียมสมาร์ตโฟนหรือโน้ตบุ๊กพร้อมโปรแกรมตัดต่อ",
    // Unsplash photo-1574717024653-61fd2cf4d44d
    cover: "/assets/images/workshop-video-editing.jpg",
    start: "2026-12-12T09:00:00+07:00",
    end: "2026-12-12T12:00:00+07:00",
    place: "ห้องปฏิบัติการสื่อดิจิทัล (ตัวอย่าง)",
    capacity: 25,
    hours: 3,
  },
  {
    id: "sample-python-202612",
    title: "เริ่มเขียน Python ผ่านโปรเจกต์เล็ก ๆ",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nเรียนรู้ตัวแปร เงื่อนไข และการวนซ้ำ ผ่านแบบฝึกหัดที่เข้าใจง่าย พร้อมสร้างโปรแกรมคำนวณหรือจัดการรายการงานชิ้นแรก เหมาะสำหรับผู้ที่ยังไม่มีพื้นฐานการเขียนโปรแกรม กรุณาเตรียมโน้ตบุ๊กที่สามารถใช้งานเครื่องมือเขียน Python ได้",
    // Unsplash photo-1515879218367-8466d910aaa4
    cover: "/assets/images/workshop-python.jpg",
    start: "2026-12-16T13:00:00+07:00",
    end: "2026-12-16T16:00:00+07:00",
    place: "ห้องปฏิบัติการเขียนโปรแกรม (ตัวอย่าง)",
    capacity: 30,
    hours: 3,
  },
  {
    id: "sample-teamwork-202612",
    title: "ทำงานเป็นทีม เปลี่ยนไอเดียให้เป็นแผนที่ลงมือได้",
    description:
      "กิจกรรมตัวอย่างสำหรับทดลองระบบ\n\nฝึกสื่อสารในทีม แบ่งหน้าที่ จัดลำดับความสำคัญ และวางแผนงานร่วมกันผ่านโจทย์กลุ่ม พร้อมทดลองใช้บอร์ดติดตามงานและทบทวนสิ่งที่ได้เรียนรู้ เหมาะสำหรับผู้ที่กำลังทำโครงงานหรือเตรียมฝึกงาน",
    // Unsplash photo-1521737711867-e3b97375f902
    cover: "/assets/images/workshop-teamwork.jpg",
    start: "2026-12-19T09:00:00+07:00",
    end: "2026-12-19T12:00:00+07:00",
    place: "พื้นที่เรียนรู้ร่วมกัน Co-learning Space (ตัวอย่าง)",
    capacity: 24,
    hours: 3,
  },
];

async function addSampleWorkshops(db, items = samples) {
  for (const item of items)
    if (!validCover(item.cover)) throw Error("SAMPLE_COVER_MISSING");
  return db.withRequest(async () => {
    await db.exec("BEGIN IMMEDIATE");
    try {
      const row = await db
        .prepare(
          "SELECT revision,data_json FROM app_state WHERE id=1 FOR UPDATE",
        )
        .get();
      if (!row) throw Error("WORKSPACE_NOT_INITIALIZED");
      const snapshot = readJson(row.data_json);
      if (
        !Array.isArray(snapshot.workshops) ||
        !Array.isArray(snapshot.auditLog)
      )
        throw Error("INVALID_WORKSPACE");
      const added = [];
      const timestamp = now();
      for (const item of items) {
        const inserted = await db
          .prepare(
            "INSERT INTO workshops(id,title,description,cover,start_at,end_at,place,capacity,hours,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id",
          )
          .all(
            item.id,
            item.title,
            item.description,
            item.cover,
            item.start,
            item.end,
            item.place,
            item.capacity,
            item.hours,
            timestamp,
          );
        if (!inserted.length) continue;
        // Fail safely instead of creating a duplicate ID in a pre-existing snapshot.
        if (snapshot.workshops.some((w) => w.id === item.id))
          throw Error("SAMPLE_SNAPSHOT_CONFLICT");
        snapshot.workshops.push({
          ...item,
          start: localDateInput(item.start),
          end: localDateInput(item.end),
          closed: false,
          icon: "fa-graduation-cap",
          category: "BSRU WORKSHOP",
        });
        snapshot.auditLog.unshift({
          id: uid(),
          actorId: "system",
          actorName: "ระบบ · เพิ่มกิจกรรมตัวอย่าง",
          action: "create",
          entity: "workshops",
          entityId: item.id,
          createdAt: timestamp,
        });
        added.push(item.id);
      }
      if (added.length) {
        snapshot.revision = Number(row.revision) + 1;
        await db
          .prepare(
            "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
          )
          .run(snapshot.revision, JSON.stringify(snapshot), timestamp);
      }
      await db.exec("COMMIT");
      return { added, skipped: items.length - added.length };
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  });
}

async function main() {
  const mode = process.argv[2];
  const items = process.argv.includes("--additional")
    ? additionalSamples
    : samples;
  if (!mode || mode === "--preview") {
    console.log(JSON.stringify({ preview: true, workshops: items }, null, 2));
    return;
  }
  if (!["--apply", "--verify"].includes(mode))
    throw Error("USE_PREVIEW_APPLY_OR_VERIFY");
  require("../src/config");
  const db = require("../src/database").createPostgresDatabase(
    require("../src/database/pool").createPool(),
  );
  try {
    const result =
      mode === "--apply" ? await addSampleWorkshops(db, items) : {};
    const workshops = await db
      .prepare(
        `SELECT id,title,cover,start_at,end_at,capacity,hours,closed FROM workshops WHERE id IN (${items.map(() => "?").join(",")}) ORDER BY start_at`,
      )
      .all(...items.map((w) => w.id));
    const row = await db
      .prepare(
        "SELECT data_json->'workshops' AS workshops FROM app_state WHERE id=1",
      )
      .get();
    const snapshot = row ? readJson(row.workshops) : [];
    const verified = workshops.map((w) => ({
      ...w,
      inSnapshot: snapshot.some(
        (item) =>
          item.id === w.id &&
          item.title === w.title &&
          item.cover === w.cover &&
          item.start === localDateInput(w.start_at) &&
          item.end === localDateInput(w.end_at) &&
          item.capacity === w.capacity &&
          item.hours === w.hours &&
          item.closed === Boolean(w.closed),
      ),
    }));
    console.log(JSON.stringify({ ...result, workshops: verified }, null, 2));
    if (verified.length !== items.length || verified.some((w) => !w.inSnapshot))
      throw Error("SAMPLE_VERIFICATION_FAILED");
  } finally {
    await db.close();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(
      "Sample workshop operation failed:",
      error.code ||
        (error.message?.match(/^[A-Z_]+$/) ? error.message : error.name),
    );
    process.exitCode = 1;
  });
module.exports = { addSampleWorkshops, samples, additionalSamples };

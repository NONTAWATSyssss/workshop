"use strict";

module.exports = function createAvatarRoute(c) {
  const {
    db,
    json,
    requireAccess,
    bodyJson,
    validCover,
    crypto,
    now,
    publicUser,
    refreshSnapshot,
    viewFromSnapshot,
  } = c;
  return async function avatarRoute(req, res, url) {
    const match = /^\/api\/avatars\/([^/]+)$/.exec(url.pathname);
    const upload = url.pathname === "/api/account/avatar";
    if (!match && !upload) return false;
    if ((match && req.method !== "GET") || (upload && req.method !== "POST")) {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    const session = await requireAccess(req, res);
    if (!session) return true;
    if (match) {
      let id;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        json(res, 400, { error: "URL ไม่ถูกต้อง" });
        return true;
      }
      if (id !== session.user.id && session.user.role !== "staff") {
        json(res, 403, { error: "ไม่มีสิทธิ์ดูรูปโปรไฟล์นี้" });
        return true;
      }
      const row = await db
        .prepare(
          "SELECT a.image,u.avatar_version FROM user_avatars a JOIN users u ON u.id=a.user_id WHERE a.user_id=?",
        )
        .get(id);
      const image =
        /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
          row?.image || "",
        );
      if (!image || !validCover(row.image)) {
        json(res, 404, { error: "ยังไม่มีรูปโปรไฟล์" });
        return true;
      }
      const etag = `"${row.avatar_version}"`;
      const headers = {
        "Cache-Control": "private, max-age=0, must-revalidate",
        Vary: "Cookie",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        res.end();
        return true;
      }
      const bytes = Buffer.from(image[2], "base64");
      res.writeHead(200, {
        ...headers,
        "Content-Type": `image/${image[1]}`,
        "Content-Length": bytes.length,
      });
      res.end(bytes);
      return true;
    }
    const data = await bodyJson(req);
    if (
      Object.keys(data).some((key) => key !== "image") ||
      typeof data.image !== "string"
    ) {
      json(res, 400, { error: "กรุณาเลือกรูปโปรไฟล์ให้ถูกต้อง" });
      return true;
    }
    if (data.image.length > 700000) {
      json(res, 413, {
        error: "รูปโปรไฟล์ต้องมีขนาดไม่เกิน 512 KB หลังย่อภาพ",
      });
      return true;
    }
    if (
      data.image &&
      (!/^data:image\/(jpeg|png|webp);base64,/.test(data.image) ||
        !validCover(data.image))
    ) {
      json(res, 400, { error: "รองรับเฉพาะรูป JPG, PNG และ WebP ที่ถูกต้อง" });
      return true;
    }
    if (
      data.image &&
      Buffer.from(data.image.split(",")[1], "base64").length > 512 * 1024
    ) {
      json(res, 413, {
        error: "รูปโปรไฟล์ต้องมีขนาดไม่เกิน 512 KB หลังย่อภาพ",
      });
      return true;
    }
    const version = data.image
      ? crypto.createHash("sha256").update(data.image).digest("hex")
      : "";
    let account, snapshot;
    await db.exec("BEGIN IMMEDIATE");
    try {
      if (data.image)
        await db
          .prepare(
            "INSERT INTO user_avatars(user_id,image,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image,updated_at=excluded.updated_at",
          )
          .run(session.user.id, data.image, now());
      else
        await db
          .prepare("DELETE FROM user_avatars WHERE user_id=?")
          .run(session.user.id);
      await db
        .prepare("UPDATE users SET avatar_version=? WHERE id=?")
        .run(version, session.user.id);
      account = publicUser(
        await db.prepare("SELECT * FROM users WHERE id=?").get(session.user.id),
      );
      snapshot = await refreshSnapshot();
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    json(res, 200, {
      user: account,
      store: viewFromSnapshot(snapshot, account),
    });
    return true;
  };
};

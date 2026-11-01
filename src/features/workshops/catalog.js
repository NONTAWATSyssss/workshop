"use strict";
const { localDateInput, workshopCoverUrl } = require("../../core/utils");

// Select public fields explicitly; never return users or the private snapshot.
const columns = `w.id,w.title,w.description,
  CASE WHEN w.cover LIKE 'data:image/%' THEN '' ELSE w.cover END AS cover,
  CASE WHEN w.cover LIKE 'data:image/%' THEN md5(w.cover) ELSE NULL END AS cover_version,
  w.start_at,w.end_at,w.place,w.capacity,w.hours,w.closed,w.created_at,
  (SELECT count(*) FROM registrations r WHERE r.workshop_id=w.id AND r.status IN ('PENDING','ATTENDED','ABSENT')) AS occupancy`;
const present = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  cover: row.cover_version
    ? workshopCoverUrl(row.id, row.cover_version)
    : row.cover,
  start: localDateInput(row.start_at),
  end: localDateInput(row.end_at),
  place: row.place,
  capacity: row.capacity,
  hours: row.hours,
  closed: Boolean(row.closed),
  occupancy: Number(row.occupancy),
  createdAt: row.created_at,
});
function createCatalog(db) {
  return {
    async list() {
      return (
        await db
          .prepare(
            `SELECT ${columns} FROM workshops w ORDER BY w.start_at,w.id`,
          )
          .all()
      ).map(present);
    },
    async find(id) {
      const row = await db
        .prepare(`SELECT ${columns} FROM workshops w WHERE w.id=?`)
        .get(id);
      return row ? present(row) : null;
    },
    async cover(id) {
      return (
        (await db.prepare("SELECT cover FROM workshops WHERE id=?").get(id))
          ?.cover || null
      );
    },
  };
}
module.exports = { createCatalog };

import lunarPackage from "lunar-javascript";

const { Solar } = lunarPackage;
const DAY_MS = 24 * 60 * 60 * 1000;

function zonedDateParts(now, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function followingDay({ year, month, day }) {
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getSolarTermDisplay(
  now = new Date(),
  timezone = "Asia/Shanghai",
) {
  const today = zonedDateParts(now, timezone);
  const lunar = Solar.fromYmd(today.year, today.month, today.day).getLunar();
  const termToday = lunar.getJieQi();
  const current = termToday || lunar.getPrevJieQi().getName();
  let nextTerm = lunar.getNextJieQi();

  // On the solar term's calendar day, the library returns that same term as
  // both the current and next boundary. Move one day ahead to find the next one.
  if (termToday && nextTerm.getName() === termToday) {
    const tomorrow = followingDay(today);
    nextTerm = Solar.fromYmd(
      tomorrow.year,
      tomorrow.month,
      tomorrow.day,
    )
      .getLunar()
      .getNextJieQi();
  }

  const [nextYear, nextMonth, nextDay] = nextTerm
    .getSolar()
    .toYmd()
    .split("-")
    .map(Number);
  const daysUntilNext = Math.max(
    0,
    Math.round(
      (Date.UTC(nextYear, nextMonth - 1, nextDay) -
        Date.UTC(today.year, today.month - 1, today.day)) /
        DAY_MS,
    ),
  );
  const next = nextTerm.getName();

  return {
    current,
    next,
    daysUntilNext,
    text: `${current} · 距${next}${daysUntilNext}天`,
  };
}

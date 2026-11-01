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

// Product calendar: popular Chinese festivals, not every observance in the library.
const FESTIVALS = new Map([
  ["元旦节", "元旦"], ["春节", "春节"], ["除夕", "除夕"],
  ["元宵节", "元宵节"], ["妇女节", "妇女节"], ["劳动节", "劳动节"],
  ["儿童节", "儿童节"], ["端午节", "端午节"], ["七夕节", "七夕"],
  ["中秋节", "中秋节"], ["教师节", "教师节"], ["国庆节", "国庆节"],
  ["重阳节", "重阳节"], ["腊八节", "腊八节"],
]);

export function getCalendarLabel(now = new Date(), timezone = "Asia/Shanghai") {
  const today = zonedDateParts(now, timezone);
  const solar = Solar.fromYmd(today.year, today.month, today.day);
  const lunar = solar.getLunar();
  const festivals = [...new Set([...solar.getFestivals(), ...lunar.getFestivals()]
    .filter((name) => FESTIVALS.has(name)).map((name) => FESTIVALS.get(name)))];
  if (lunar.getJieQi() === "清明") festivals.push("清明节");
  // Northern and southern Little New Year are both commonly celebrated.
  if (lunar.getMonth() === 12 && [23, 24].includes(lunar.getDay())) festivals.push("小年");
  return festivals.length ? festivals.join("/") : getSolarTermDisplay(now, timezone).current;
}

import { DailySchedule, TimeBlock } from "./api";

export function generateMockSchedules(count: number = 7): DailySchedule[] {
  const schedules: DailySchedule[] = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const sleepStart = 22 + Math.random() * 2; // 22:00 - 24:00
    const sleepEnd = 6 + Math.random() * 2; // 06:00 - 08:00
    const workStart = 9;
    const workEnd = 17 + Math.random() * 2; // 17:00 - 19:00
    const breakStart = 12;
    const breakEnd = 13;

    const timeBlocks: TimeBlock[] = [
      {
        startTime: "06:00",
        endTime: "09:00",
        type: "personal",
        title: "Morning Routine",
        priority: 1,
      },
      {
        startTime: "09:00",
        endTime: "12:00",
        type: "study",
        title: "Study Block",
        priority: 2,
      },
      {
        startTime: "12:00",
        endTime: "13:00",
        type: "break",
        title: "Lunch Break",
        priority: 1,
      },
      {
        startTime: "13:00",
        endTime: "17:00",
        type: "study",
        title: "Study Block",
        priority: 2,
      },
      {
        startTime: "17:00",
        endTime: "18:30",
        type: "break",
        title: "Free Time",
        priority: 1,
      },
      {
        startTime: "18:30",
        endTime: "20:00",
        type: "study",
        title: "Evening Study",
        priority: 2,
      },
      {
        startTime: "20:00",
        endTime: "22:00",
        type: "personal",
        title: "Personal Time",
        priority: 1,
      },
      {
        startTime: "22:00",
        endTime: "06:00",
        type: "personal",
        title: "Sleep",
        priority: 3,
      },
    ];

    schedules.push({
      id: i,
      scheduleDate: dateStr,
      scheduleData: JSON.stringify(timeBlocks),
      timeBlocks,
      generatedAt: new Date().toISOString(),
    });
  }

  return schedules;
}

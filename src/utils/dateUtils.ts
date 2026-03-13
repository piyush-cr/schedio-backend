import { parseISO, addDays, endOfMonth, parse, startOfWeek } from "date-fns";

export function getLastDateOfWeek(dateString?: string): Date {
    let start: Date;

    if (dateString) {
        start = parseISO(dateString);
    } else {
        start = startOfWeek(new Date(), { weekStartsOn: 0 });
    }

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return end;
}


export function getLastDateOfMonth(date: string): Date {
    return endOfMonth(parseISO(date));
}

export function getLastDateOfMonthByName(
    monthName: string,
    year: number
): Date {
    const date = parse(`${monthName} ${year}`, "MMMM yyyy", new Date());
    return endOfMonth(date);
}
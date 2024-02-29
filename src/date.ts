import moment from 'moment';

export default class TeaDate {
  date: moment.Moment

  constructor(date: moment.MomentInput) {
    this.date = moment(date);
  }

  format(layout: string): string {
    layout = layout.replace(/y/g, 'Y')
      .replace(/d/g, 'D').replace(/h/g, 'H')
      .replace(/a/g, 'A').replace(/E/g, 'd');
    return this.date.format(layout);
  }

  unix(): number {
    return this.date.unix();
  }

  sub(amount: moment.unitOfTime.Base, unit: number): TeaDate {
    const date = moment(this.date).subtract(unit, amount);
    return new TeaDate(date);
  }

  add(amount: moment.unitOfTime.Base, unit: number): TeaDate {
    const date = moment(this.date).add(unit, amount);
    return new TeaDate(date);
  }

  diff(amount: moment.unitOfTime.Base, diffDate: TeaDate): number {
    return  this.date.diff(diffDate.date, amount);
  }

  hour(): number {
    return this.date.hour();
  }

  minute(): number {
    return this.date.minute();
  }

  second(): number {
    return this.date.second();
  }

  month(): number {
    return this.date.month() + 1;
  }

  year(): number {
    return this.date.year();
  }

  dayOfMonth(): number {
    return this.date.date();
  }

  dayOfWeek(): number {
    const weekday = this.date.weekday();
    if(weekday === 0) {
      // sunday
      return 7;
    }
    return weekday + 1;
  }

  weekOfMonth(): number {
    const startWeek = moment(this.date).startOf('month').week();
    let dateWeek = this.date.week();
    if (this.date.weekday() === 0) {
      dateWeek = dateWeek - 1;
    }
    if (dateWeek === 0 && this.date.date() > 1) {
      // the last day of this year is sunday
      return this.sub('day', 1).weekOfMonth();
    }
    const monthWeek = dateWeek - startWeek;
    if(monthWeek < 0) {
      // start of a new year
      return 1;
    }
    return monthWeek + 1;
  }

  weekOfYear(): number {
    const weekday = this.date.weekday();
    const week =  this.date.week();
    if(weekday === 0 && week === 1  && this.date.date() > 1) {
      // the last day of this year is sunday
      return this.sub('day', 1).weekOfYear();
    }
    return this.date.week();
  }
}
const _ = require('underscore');

const NO_LMP_DATE_MODIFIER = 4;

module.exports = function (settings) {
  const taskSchedules = settings && settings.tasks && settings.tasks.schedules;
  const lib = {
    /**
     * @function
     * In legacy versions, partner code is required to only emit tasks which are ready to be displayed to the user. Utils.isTimely is the mechanism used for this.
     * With the rules-engine improvements in webapp 3.8, this responsibility shifts. Partner code should emit all tasks and the webapp's rules-engine decides what to display.
     * To this end - Utils.isTimely becomes a pass-through in nootils@4.x
     * @returns True
    */
    isTimely: () => true,

    addDate: function (date, days) {
      let result;
      if (date) {
        result = new Date(date.getTime());
      } else {
        result = lib.now();
      }
      result.setDate(result.getDate() + days);
      result.setHours(0, 0, 0, 0);
      return result;
    },

    getLmpDate: function (doc) {
      const weeks = doc.fields.last_menstrual_period || NO_LMP_DATE_MODIFIER;
      return lib.addDate(new Date(doc.reported_date), weeks * -7);
    },

    // TODO getSchedule() can be removed when tasks.json support is dropped
    getSchedule: function (name) {
      return _.findWhere(taskSchedules, { name: name });
    },

    getMostRecentTimestamp: function (reports, form, fields) {
      const report = lib.getMostRecentReport(reports, form, fields);
      return report && report.reported_date;
    },

    getMostRecentReport: function (reports, form, fields) {
      let result = null;
      reports.forEach(function (report) {
        if (report.form === form &&
          !report.deleted &&
          (!result || (report.reported_date > result.reported_date)) &&
          (!fields || (report.fields && lib.fieldsMatch(report, fields)))) {
          result = report;
        }
      });
      return result;
    },

    isFormSubmittedInWindow: function (reports, form, start, end, count) {
      let result = false;
      reports.forEach(function (report) {
        if (!result && report.form === form) {
          if (report.reported_date >= start && report.reported_date <= end) {
            if (!count ||
              (count && report.fields && report.fields.follow_up_count > count)) {
              result = true;
            }
          }
        }
      });
      return result;
    },

    /**
     * Provides a default resolvedIf condition for tasks, to be called from resolvedIf() section of the task
     * @param {Object} contact - Pass the first argument of resolvedIf() with the same name
     * @param {Object} report - Pass the second argument of resolvedIf() with the same name
     * @param {Object} event - Pass the third argument of resolvedIf() with the same name
     * @param {Date} dueDate - Pass the fourth argument of resolvedIf() with the same name
     * @param {String} resolvingForm - Form type used to check if resolved
     * @returns - true or false, depending on whether the contact's reports include the specified form type
     *     within a period specified by the task windoow. If the task was triggered by a report, the period
     *     starts either at the beginning of the task window or just after the triggering report's reported
     *     date, whichever comes later.       
     */
    defaultResolvedIf: function (contact, report, event, dueDate, resolvingForm) {
      let start = 0;
      if (report) {//Report based task
        //Start of the task window or after the report's reported date, whichever comes later
        start = Math.max(this.addDate(dueDate, -event.start).getTime(), report.reported_date + 1);
      }
      else {
        start = this.addDate(dueDate, -event.start).getTime();
      }
      const end = this.addDate(dueDate, event.end + 1).getTime();
      return this.isFormSubmittedInWindow(
        contact.reports,
        resolvingForm,
        start,
        end
      );
    },

    isFirstReportNewer: function (firstReport, secondReport) {
      if (firstReport && firstReport.reported_date) {
        if (secondReport && secondReport.reported_date) {
          return firstReport.reported_date > secondReport.reported_date;
        }
        return true;
      }
      return null;
    },

    isDateValid: function (date) {
      return !isNaN(date.getTime());
    },

    /**
     * @function
     * @name getField
     *
     * Gets the value of specified field path.
     * @param {Object} report - The report object.
     * @param {string} field - Period separated json path assuming report.fields as
     *      the root node e.g 'dob' (equivalent to report.fields.dob)
     *      or 'screening.test_result' equivalent to report.fields.screening.test_result
    */
    getField: function (report, field) {
      return _.propertyOf(report.fields)(field.split('.'));
    },

    fieldsMatch: function (report, fieldValues) {
      return Object.keys(fieldValues).every(function (field) {
        return lib.getField(report, field) === fieldValues[field];
      });
    },

    MS_IN_DAY: 24 * 60 * 60 * 1000, // 1 day in ms

    now: function () { return new Date(); },
  };

  return lib;
};

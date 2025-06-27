import {
  DataObject,
  getPagedGenerator,
  hasFields,
  insertReportedDateIfMissing,
  isRecord,
  isValidReportedDate,
  Nullable,
  Page
} from './libs/core';
import { adapt, assertDataContext, DataContext } from './libs/data-context';
import { Doc } from './libs/doc';
import * as Local from './local';
import { FreetextQualifier, UuidQualifier } from './qualifier';
import * as Remote from './remote';
import { DEFAULT_IDS_PAGE_LIMIT } from './libs/constants';
import { assertCursor, assertFreetextQualifier, assertLimit, assertUuidQualifier } from './libs/parameter-validators';
import { InvalidArgumentError } from './libs/error';

/** */
export namespace v1 {
  /**
   * A report document.
   */
  export interface Report extends Doc {
    readonly form: string;
    readonly reported_date: Date;
    readonly fields: DataObject;
  }

  /**
   * Returns a function for retrieving a report from the given data context.
   * @param context the current data context
   * @returns a function for retrieving a report
   * @throws Error if a data context is not provided
   */
  export const get = (context: DataContext): typeof curriedFn => {
    assertDataContext(context);
    const fn = adapt(context, Local.Report.v1.get, Remote.Report.v1.get);

    /**
     * Returns a report for the given qualifier.
     * @param qualifier identifier for the report to retrieve
     * @returns the report or `null` if no report is found for the qualifier
     * @throws Error if the qualifier is invalid
     */
    const curriedFn = async (
      qualifier: UuidQualifier
    ): Promise<Nullable<Report>> => {
      assertUuidQualifier(qualifier);
      return fn(qualifier);
    };
    return curriedFn;
  };

  /**
   * Returns a function for retrieving a paged array of report identifiers from the given data context.
   * @param context the current data context
   * @returns a function for retrieving a paged array of report identifiers
   * @throws Error if a data context is not provided
   * @see {@link getUuids} which provides the same data, but without having to manually account for paging
   */
  export const getUuidsPage = (context: DataContext): typeof curriedFn => {
    assertDataContext(context);
    const fn = adapt(context, Local.Report.v1.getUuidsPage, Remote.Report.v1.getUuidsPage);

    /**
     * Returns an array of report identifiers for the provided page specifications.
     * @param qualifier the limiter defining which identifiers to return
     * @param cursor the token identifying which page to retrieve. A `null` value indicates the first page should be
     * returned. Subsequent pages can be retrieved by providing the cursor returned with the previous page.
     * @param limit the maximum number of identifiers to return. Default is 10000.
     * @returns a page of report identifiers for the provided specification
     * @throws InvalidArgumentError if no qualifier is provided or if the qualifier is invalid
     * @throws InvalidArgumentError if the provided `limit` value is `<=0`
     * @throws InvalidArgumentError if the provided cursor is not a valid page token or `null`
     */
    const curriedFn = async (
      qualifier: FreetextQualifier,
      cursor: Nullable<string> = null,
      limit: number | `${number}` = DEFAULT_IDS_PAGE_LIMIT
    ): Promise<Page<string>> => {
      assertFreetextQualifier(qualifier);
      assertCursor(cursor);
      assertLimit(limit);

      return fn(qualifier, cursor, Number(limit));
    };
    return curriedFn;
  };

  /**
   * Returns a function for getting a generator that fetches report identifiers from the given data context.
   * @param context the current data context
   * @returns a function for getting a generator that fetches report identifiers
   * @throws Error if a data context is not provided
   */
  export const getUuids = (context: DataContext): typeof curriedGen => {
    assertDataContext(context);
    const getPage = context.bind(v1.getUuidsPage);

    /**
     * Returns a generator for fetching all report identifiers that match the given qualifier
     * @param qualifier the limiter defining which identifiers to return
     * @returns a generator for fetching all report identifiers that match the given qualifier
     * @throws InvalidArgumentError if no qualifier is provided or if the qualifier is invalid
     */
    const curriedGen = (
      qualifier: FreetextQualifier
    ): AsyncGenerator<string, null> => {
      assertFreetextQualifier(qualifier);

      return getPagedGenerator(getPage, qualifier);
    };
    return curriedGen;
  };

  /** 
   * An input object for a report
   */
  export type ReportInput = Readonly<{
    type: string,
    form: string,
    reported_date?: string | number,
    _id?: string,
    _rev?: string
  }>;
  
  /**
   * Builds an input object for creation and update of a report with
   * the given fields.
   * @param data object containing the fields for a report
   * @returns the report input
   * @throws Error if data is not an object
   * @throws Error if type is not provided or is empty
   * @throws Error if form is not provided or is empty
   * @throws Error if reported_date is not in a valid format.
   * Valid formats are 'YYYY-MM-DDTHH:mm:ssZ', 'YYYY-MM-DDTHH:mm:ss.SSSZ', or <unix epoch>.
   */
  export const byReportInput = (data: unknown): ReportInput => {
    if (!isRecord(data)) {
      throw new InvalidArgumentError('Invalid "data": expected an object.');
    }
    
    const input = {...data};
    insertReportedDateIfMissing(input);
    if (!isValidReportedDate(input.reported_date)) {
      throw new InvalidArgumentError(
        'Invalid reported_date. Expected format to be ' +
          '\'YYYY-MM-DDTHH:mm:ssZ\', \'YYYY-MM-DDTHH:mm:ss.SSSZ\', or a Unix epoch.'
      );
    }
    if (!isReportInput(input)) {
      throw new InvalidArgumentError(`Missing or empty required fields (type, form) in [${JSON.stringify(data)}].`);
    }
    return input;
  };
  
  /**
   * Returns `true` if the given input is a {@link ReportInput} otherwise `false`.
   * @param input the input to check
   * @returns `true` if the given type is a {@link ReportInput}, otherwise `false`.
   */
  export const isReportInput = (input: unknown): input is ReportInput => {
    if (isRecord(input) && 
        hasFields(input, [{name: 'type', type: 'string', ensureTruthyValue: true}, 
          {name: 'form', type: 'string', ensureTruthyValue: true}])
    ){
      if ('reported_date' in input && !isValidReportedDate(input.reported_date)){
        return false;
      }
      return true;
    }
    return false;
  };
}

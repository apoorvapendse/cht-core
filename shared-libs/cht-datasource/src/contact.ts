import {
  DataObject,
  getPagedGenerator, hasFields, isRecord, isValidReportedDate, NormalizedParent,
  Nullable,
  Page, insertReportedDateIfMissing
} from './libs/core';
import {
  ContactTypeQualifier,
  FreetextQualifier,
  UuidQualifier
} from './qualifier';
import { adapt, assertDataContext, DataContext } from './libs/data-context';
import { LocalDataContext } from './local/libs/data-context';
import { RemoteDataContext } from './remote/libs/data-context';
import * as Local from './local';
import * as Remote from './remote';
import { DEFAULT_IDS_PAGE_LIMIT } from './libs/constants';
import {
  assertContactTypeFreetextQualifier,
  assertCursor,
  assertLimit,
  assertUuidQualifier,
} from './libs/parameter-validators';
import { Doc } from './libs/doc';
import { InvalidArgumentError } from './libs/error';

/** */
export namespace v1 {
  /**
   * Immutable data about a Contact.
   */
  export interface Contact extends Doc, NormalizedParent {
    readonly contact_type?: string;
    readonly name?: string;
    readonly reported_date?: Date;
    readonly type: string;
  }

  /**
   * Immutable data about a contact, including the full records of the parent's lineage.
   */
  export interface ContactWithLineage extends Contact {
    readonly parent?: ContactWithLineage | NormalizedParent;
  }

  const getContact =
    <T>(
      localFn: (c: LocalDataContext) => (qualifier: UuidQualifier) => Promise<T>,
      remoteFn: (c: RemoteDataContext) => (qualifier: UuidQualifier) => Promise<T>
    ) => (context: DataContext): typeof curriedFn => {
      assertDataContext(context);
      const fn = adapt(context, localFn, remoteFn);

      /**
       * Returns the contact with the given identifier.
       * @param qualifier the limiter defining which contact to return
       * @returns the contact with the given identifier
       * @throws InvalidArgumentError if no qualifier is provided or if the qualifier is invalid
       */
      const curriedFn = async (qualifier: UuidQualifier): Promise<T> => {
        assertUuidQualifier(qualifier);
        return fn(qualifier);
      };
      return curriedFn;
    };

  /**
   * Returns a function for retrieving a contact from the given data context.
   * @param context the current data context
   * @returns a function for retrieving a contact
   * @throws Error if a data context is not provided
   */
  export const get = getContact(Local.Contact.v1.get, Remote.Contact.v1.get);

  /**
   * Returns a function for retrieving a contact from the given data context with the contact's parent lineage.
   * @param context the current data context
   * @returns a function for retrieving a contact with the contact's parent lineage
   * @throws Error if a data context is not provided
   */
  export const getWithLineage = getContact(Local.Contact.v1.getWithLineage, Remote.Contact.v1.getWithLineage);

  /**
   * Returns a function for retrieving a paged array of contact identifiers from the given data context.
   * @param context the current data context
   * @returns a function for retrieving a paged array of contact identifiers
   * @throws Error if a data context is not provided
   * @see {@link getUuids} which provides the same data, but without having to manually account for paging
   */
  export const getUuidsPage = (context: DataContext): typeof curriedFn => {
    assertDataContext(context);
    const fn = adapt(context, Local.Contact.v1.getUuidsPage, Remote.Contact.v1.getUuidsPage);

    /**
     * Returns an array of contact identifiers for the provided page specifications.
     * @param qualifier the limiter defining which identifiers to return
     * @param cursor the token identifying which page to retrieve. A `null` value indicates the first page should be
     * returned. Subsequent pages can be retrieved by providing the cursor returned with the previous page.
     * @param limit the maximum number of identifiers to return. Default is 10000.
     * @returns a page of contact identifiers for the provided specification
     * @throws InvalidArrgumentError if no qualifier is provided or if the qualifier is invalid
     * @throws InvalidArgumentError if the provided `limit` value is `<=0`
     * @throws InvalidArgumentError if the provided cursor is not a valid page token or `null`
     */
    const curriedFn = async (
      qualifier: ContactTypeQualifier | FreetextQualifier,
      cursor: Nullable<string> = null,
      limit: number | `${number}` = DEFAULT_IDS_PAGE_LIMIT
    ): Promise<Page<string>> => {
      assertCursor(cursor);
      assertLimit(limit);
      assertContactTypeFreetextQualifier(qualifier);

      return fn(qualifier, cursor, Number(limit));
    };
    return curriedFn;
  };

  /**
   * Returns a function for getting a generator that fetches contact identifiers from the given data context.
   * @param context the current data context
   * @returns a function for getting a generator that fetches contact identifiers
   * @throws Error if a data context is not provided
   */
  export const getUuids = (context: DataContext): typeof curriedGen => {
    assertDataContext(context);
    const getPage = context.bind(v1.getUuidsPage);

    /**
     * Returns a generator for fetching all contact identifiers that match the given qualifier
     * @param qualifier the limiter defining which identifiers to return
     * @returns a generator for fetching all contact identifiers that match the given qualifier
     * @throws InvalidArgumentError if no qualifier is provided or if the qualifier is invalid
     */
    const curriedGen = (
      qualifier: ContactTypeQualifier | FreetextQualifier
    ): AsyncGenerator<string, null> => {
      assertContactTypeFreetextQualifier(qualifier);

      return getPagedGenerator(getPage, qualifier);
    };
    return curriedGen;
  };

  /** 
   * An input object to create/update a contact
   */
  export type ContactInput = DataObject & Readonly<{
    type: string,
    name: string,
    reported_date?: string | number,
    _id?: string,
    _rev?: string
  }>;
  
  /**
   * Builds an input object for creation and update of a contact with
   * the given fields.
   * @param data object containing the fields for a contact
   * @returns the contact input
   * @throws Error if data is not an object
   * @throws Error if type is not provided or is empty
   * @throws Error if name is not provided or is empty
   * @throws Error if reported_date is not in a valid format. 
   * Valid formats are 'YYYY-MM-DDTHH:mm:ssZ', 'YYYY-MM-DDTHH:mm:ss.SSSZ', or <unix epoch>.
   */
  export const byContactInput = (data: unknown): ContactInput => {
    return byContactInputNonAssertive(data) as ContactInput;
  };
  
  /** @internal*/
  export const byContactInputNonAssertive = (data: unknown) : Record<string, unknown> => {
    if (!isRecord(data)){
      throw new InvalidArgumentError('Invalid "data": expected an object.');
    }
    const input = {...data};
    insertReportedDateIfMissing(input);
    if (!isValidReportedDate(input.reported_date)){
      throw new InvalidArgumentError(
        'Invalid reported_date. Expected format to be ' +
          '\'YYYY-MM-DDTHH:mm:ssZ\', \'YYYY-MM-DDTHH:mm:ss.SSSZ\', or a Unix epoch.'
      );
    }
    if (!checkContactInputFields(input)){
      throw new InvalidArgumentError(
        `Missing or empty required fields (name, type) for [${JSON.stringify(data)}].`
      );
    }
    return input;
  };
  
  /**
   * Returns `true` if the given input is a {@link ContactInput} otherwise `false`.
   * @param input the input to check
   * @returns `true` if the given type is a {@link ContactInput}, otherwise `false`.
   */
  export const isContactInput = (input: unknown): input is ContactInput => {
    return checkContactInputFields(input);
  };
  
  /** @internal */
  export const checkContactInputFields = (data: unknown): data is Record<string, unknown> => {
    return isRecord(data) && 
      hasFields(data, [
        {name: 'type', type: 'string', ensureTruthyValue: true}, 
        {name: 'name', type: 'string', ensureTruthyValue: true}
      ]) &&
      (!('reported_date' in data) || isValidReportedDate(data.reported_date));
  };
}

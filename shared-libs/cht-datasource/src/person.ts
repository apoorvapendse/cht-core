import { ContactTypeQualifier, UuidQualifier } from './qualifier';
import { adapt, assertDataContext, DataContext } from './libs/data-context';
import * as Contact from './contact';
import * as Remote from './remote';
import * as Local from './local';
import * as Place from './place';
import { LocalDataContext } from './local/libs/data-context';
import { RemoteDataContext } from './remote/libs/data-context';
import { getPagedGenerator, hasField, NormalizedParent, Nullable, Page } from './libs/core';
import { DEFAULT_DOCS_PAGE_LIMIT } from './libs/constants';
import { assertCursor, assertLimit, assertPersonInput, 
  assertTypeQualifier, assertUuidQualifier } from './libs/parameter-validators';
import { InvalidArgumentError } from './libs/error';

/** */
export namespace v1 {
  /**
   * Immutable data about a person contact.
   */
  export interface Person extends Contact.v1.Contact {
    readonly date_of_birth?: Date;
    readonly phone?: string;
    readonly patient_id?: string;
    readonly sex?: string;
  }

  /**
   * Immutable data about a person contact, including the full records of the parent place lineage.
   */
  export interface PersonWithLineage extends Person {
    readonly parent?: Place.v1.PlaceWithLineage | NormalizedParent;
  }

  const getPerson =
    <T>(
      localFn: (c: LocalDataContext) => (qualifier: UuidQualifier) => Promise<T>,
      remoteFn: (c: RemoteDataContext) => (qualifier: UuidQualifier) => Promise<T>
    ) => (context: DataContext) => {
      assertDataContext(context);
      const fn = adapt(context, localFn, remoteFn);
      return async (qualifier: UuidQualifier): Promise<T> => {
        assertUuidQualifier(qualifier);
        return fn(qualifier);
      };
    };

  const createPersonDoc =
  <T>(
      localFn: (c: LocalDataContext) => (input: PersonInput) => Promise<T>,
      remoteFn: (c: RemoteDataContext) => (input: PersonInput) => Promise<T>
    ) => (context: DataContext) => {
      assertDataContext(context);
      const fn = adapt(context, localFn, remoteFn);
      return async (input: PersonInput): Promise<T> => {
        assertPersonInput(input);
        return fn(input);
      };
    };

  /**
   * Returns a person for the given qualifier.
   * @param context the current data context
   * @returns the person or `null` if no person is found for the qualifier
   * @throws Error if the provided context or qualifier is invalid
   */
  export const get = getPerson(Local.Person.v1.get, Remote.Person.v1.get);

  /**
   * Returns a person for the given qualifier with the person's parent lineage.
   * @param context the current data context
   * @returns the person or `null` if no person is found for the qualifier
   * @throws Error if the provided context or qualifier is invalid
   */
  export const getWithLineage = getPerson(Local.Person.v1.getWithLineage, Remote.Person.v1.getWithLineage);

  /**
   * Returns a function for retrieving a paged array of people from the given data context.
   * @param context the current data context
   * @returns a function for retrieving a paged array of people
   * @throws Error if a data context is not provided
   * @see {@link getAll} which provides the same data, but without having to manually account for paging
   */
  export const getPage = (context: DataContext): typeof curriedFn => {
    assertDataContext(context);
    const fn = adapt(context, Local.Person.v1.getPage, Remote.Person.v1.getPage);

    /**
     * Returns an array of people for the provided page specifications.
     * @param personType the type of people to return
     * @param cursor the token identifying which page to retrieve. A `null` value indicates the first page should be
     * returned. Subsequent pages can be retrieved by providing the cursor returned with the previous page.
     * @param limit the maximum number of people to return. Default is 100.
     * @returns a page of people for the provided specification
     * @throws InvalidArgumentError if no type is provided or if the type is not for a person
     * @throws InvalidArgumentError if the provided `limit` value is `<=0`
     * @throws InvalidArgumentError if the provided cursor is not a valid page token or `null`
     */
    const curriedFn = async (
      personType: ContactTypeQualifier,
      cursor: Nullable<string> = null,
      limit: number | `${number}` = DEFAULT_DOCS_PAGE_LIMIT
    ): Promise<Page<Person>> => {
      assertTypeQualifier(personType);
      assertCursor(cursor);
      assertLimit(limit);

      return fn(personType, cursor, Number(limit));
    };
    return curriedFn;
  };

  /**
   * Returns a function for getting a generator that fetches people from the given data context.
   * @param context the current data context
   * @returns a function for getting a generator that fetches people
   * @throws Error if a data context is not provided
   */
  export const getAll = (context: DataContext): typeof curriedGen => {
    assertDataContext(context);
    const getPage = context.bind(v1.getPage);

    /**
     * Returns a generator for fetching all people with the given type
     * @param personType the type of people to return
     * @returns a generator for fetching all people with the given type
     * @throws InvalidArgumentError if no type is provided or if the type is not for a person
     */
    const curriedGen = (personType: ContactTypeQualifier): AsyncGenerator<Person, null> => {
      assertTypeQualifier(personType);
      return getPagedGenerator(getPage, personType);
    };
    return curriedGen;
  };

  /**
   * Returns a function for creating a person from the given data context.
   * @param context the current data context
   * @returns a function for creating a person.
   * @throws Error if a data context is not provided
   */
  export const createPerson = createPersonDoc(Local.Person.v1.createPerson, Remote.Person.v1.createPerson);


  /** 
   * An input for a person
   */
  export type PersonInput = Contact.v1.ContactInput & Readonly<{
    parent: string;
    date_of_birth?: Date;
    phone?: string;
    patient_id?: string;
    sex?: string;
  }>
  
  /**
   * Builds an input object for creation and update of a person with
   * the given fields.
   * @param data object containing the fields for a person
   * @returns the person input
   * @throws Error if data is not an object
   * @throws Error if type is not provided or is empty
   * @throws Error if name is not provided or is empty
   * @throws Error if parent is not provided or is empty
   * @throws Error if reported_date is not in a valid format. 
   * Valid formats are 'YYYY-MM-DDTHH:mm:ssZ', 'YYYY-MM-DDTHH:mm:ss.SSSZ', or <unix epoch>.
   */
  export const byPersonInput = (data: unknown): PersonInput => {
    const input = Contact.v1.byContactInputNonAssertive(data);
    
    if (!hasField(input, { name: 'parent', type: 'string', ensureTruthyValue: true })) {
      throw new InvalidArgumentError(`Missing or empty required field (parent) [${JSON.stringify(input)}].`);
    }
  
    return input as unknown as PersonInput;
  };
  
  /** @internal */
  export const isPersonInput = (data: unknown): data is PersonInput => {
    if (!Contact.v1.checkContactInputFields(data)) {
      return false;
    }
    
    return hasField(data, { name: 'parent', type: 'string', ensureTruthyValue: true });
  };
}

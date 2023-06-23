// npm imports
import _ from 'lodash';

// lib imports
import wrapInternalHandler from './wrapInternalHandler.js';

/**
 * Enum for template context tokens.
 * @enum {string}
 */
const TemplateContextToken = {
  APPLICATION: 'application',
  GROUP: 'group',
  MERCHANT: 'merchant',
  OFFER: 'offer',
};

// Documentation workaround from https://github.com/jsdoc2md/jsdoc-to-markdown/issues/156#issuecomment-857079419
export { TemplateContextToken };

/**
 * An object relating a TemplateContextToken to a path in a data object expressing the associated contextId.
 * @typedef {object} TemplateContextMap
 * @property {TemplateContextToken} contextToken - The context to be resolved.
 * @property {string} [path] - The path to the contextId in the data object. Ignored for context 'application'.
 */

/**
 * An object relating a TemplateContextToken to a contextId.
 * @typedef {object} TemplateContext
 * @property {TemplateContextToken} contextToken - The context to be resolved.
 * @property {number|string} [contextId] - The path to the contextId in the data object. Not valid for context 'application'.
 */

/**
 * Resolves ContextMaps for a given data object.
 * @param {TemplateContextMap[] | TemplateContextMap | TemplateContextToken.APPLICATION} [contextMaps] - An array of TemplateContextMaps, a single TemplateContextMap, or TemplateContextToken.APPLICATION.
 * @param {object} data - The source data object.
 * @return {TemplateContext[] | undefined} - An array of resolved contexts.
 */
export const resolveContexts = (contextMaps, data) => {
  // Return undefined if no contextMaps or data.
  if (!contextMaps || !data) return;

  // Return application context if contextMaps is APPLICATION.
  if (contextMaps === TemplateContextToken.APPLICATION)
    return [{ contextToken: TemplateContextToken.APPLICATION }];

  // Resolve contexts.
  const contexts = (
    _.isArray(contextMaps) ? contextMaps : [contextMaps]
  ).reduce((contexts, { contextToken, path }) => {
    let context = undefined;

    if (contextToken === TemplateContextToken.APPLICATION) {
      context = { contextToken };
    } else {
      const contextId = _.get(data, path);

      if (contextId) context = { contextToken, contextId };
    }

    return context ? [...(contexts ?? []), context] : contexts;
  }, undefined);

  // Deduplicate contexts.
  if (contexts)
    return [
      ...new Set(contexts.map((context) => JSON.stringify(context))).values(),
    ].map((context) => JSON.parse(context));
};

/**
 * Creates a handler for CRUD events.
 * @param {Function} createMessage - A function that creates a message from a given event.
 * @param {string} service - The service name.
 * @param {TemplateContextMap[] | TemplateContextMap | TemplateContextToken.APPLICATION} [contextMaps] - An array of TemplateContextMaps, a single TemplateContextMap, or TemplateContextToken.APPLICATION.
 * @return {Function} - A handler for CRUD events.
 */
export default (createMessage, service, contextMaps) =>
  wrapInternalHandler(async (event) => {
    await Promise.all(
      event.Records.map((data) => {
        const contexts = resolveContexts(contextMaps, data);

        if (contexts)
          return createMessage(undefined, {
            contexts,
            data,
            service,
          });
      })
    );

    return {};
  });

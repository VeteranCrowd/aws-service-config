/* eslint-env mocha */

import { expect } from 'chai';

import { TemplateContextToken, resolveContexts } from './crudHandler.js';

const data = { a: 1, b: 2, c: 3 };

describe('crudHandler', function () {
  describe('resolveContexts', function () {
    it('nil contextMaps', function () {
      const contexts = resolveContexts(undefined, data);

      expect(contexts).to.be.undefined;
    });

    it('nil data', function () {
      const contexts = resolveContexts(
        TemplateContextToken.APPLICATION,
        undefined
      );

      expect(contexts).to.be.undefined;
    });

    it('application context string', function () {
      const contexts = resolveContexts(TemplateContextToken.APPLICATION, data);

      expect(contexts).to.deep.equal([
        { contextToken: TemplateContextToken.APPLICATION },
      ]);
    });

    it('application context object', function () {
      const contexts = resolveContexts(
        { contextToken: TemplateContextToken.APPLICATION },
        data
      );

      expect(contexts).to.deep.equal([
        { contextToken: TemplateContextToken.APPLICATION },
      ]);
    });

    it('application context with path', function () {
      const contexts = resolveContexts(
        { contextToken: TemplateContextToken.APPLICATION, path: 'a' },
        data
      );

      expect(contexts).to.deep.equal([
        { contextToken: TemplateContextToken.APPLICATION },
      ]);
    });

    it('multiple contexts', function () {
      const contexts = resolveContexts(
        [
          { contextToken: TemplateContextToken.APPLICATION, path: 'a' },
          { contextToken: TemplateContextToken.GROUP, path: 'b' },
          { contextToken: TemplateContextToken.MERCHANT, path: 'c' },
          { contextToken: TemplateContextToken.MERCHANT, path: 'a' },
        ],
        data
      );

      expect(contexts).to.deep.equal([
        { contextToken: TemplateContextToken.APPLICATION },
        { contextToken: TemplateContextToken.GROUP, contextId: 2 },
        { contextToken: TemplateContextToken.MERCHANT, contextId: 3 },
        { contextToken: TemplateContextToken.MERCHANT, contextId: 1 },
      ]);
    });

    it('duplicate contexts', function () {
      const contexts = resolveContexts(
        [
          { contextToken: TemplateContextToken.APPLICATION, path: 'a' },
          { contextToken: TemplateContextToken.GROUP, path: 'b' },
          { contextToken: TemplateContextToken.MERCHANT, path: 'c' },
          { contextToken: TemplateContextToken.MERCHANT, path: 'c' },
        ],
        data
      );

      expect(contexts).to.deep.equal([
        { contextToken: TemplateContextToken.APPLICATION },
        { contextToken: TemplateContextToken.GROUP, contextId: 2 },
        { contextToken: TemplateContextToken.MERCHANT, contextId: 3 },
      ]);
    });
  });
});

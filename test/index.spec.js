/**
 * @fileOverview Unit tests for index.js.
 */

var index = require('../index');
var Janitor = require('../lib/janitor');

describe('index', function () {
  it('exports Janitor class', function () {
    expect(index).to.equal(Janitor);
  });
});

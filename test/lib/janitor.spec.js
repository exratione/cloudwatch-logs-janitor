/**
 * @fileOverview Unit tests for lib/janitor.js.
 */

// NPM.
var AWS = require('aws-sdk');
var _ = require('lodash');

// Local.
var Janitor = require('../../lib/janitor');

describe('lib/janitor', function () {
  var janitor;

  var creationTime;
  var olderCreationTime;
  var logGroupObjects;
  var logGroupNames;
  var sandbox;

  beforeEach(function () {
    janitor = new Janitor();

    // Need slightly older times to ensure that the comparison always
    // triggers, even on ultrafast machinery.
    creationTime = (new Date()).getTime() - 1000;
    olderCreationTime = creationTime - 10000;

    logGroupObjects = [
      {
        logGroupName: 'a-name-1',
        creationTime: creationTime
      },
      {
        logGroupName: 'b-name-2',
        creationTime: creationTime
      },
      {
        logGroupName: 'c-name-3',
        creationTime: olderCreationTime
      },
      {
        logGroupName: 'd-name-4',
        creationTime: olderCreationTime
      }
    ];
    logGroupNames = _.map(logGroupObjects, function (obj) {
      return obj.logGroupName;
    });

    // Ensure everything relevant in the underlying client is stubbed.
    sandbox = sinon.sandbox.create();
    sandbox.stub(janitor.cwlClient, 'deleteLogGroup').yields();
    sandbox.stub(janitor.cwlClient, 'describeLogGroups').yields(null, {
      logGroups: logGroupObjects
    });
  });

  afterEach(function () {
    sandbox.restore();
  });


  describe('constructor', function () {
    it('passes config to AWS client instance', function () {
      var clientConfig = {};

      sandbox.stub(AWS, 'CloudWatchLogs');
      janitor = new Janitor({
        clientConfig: clientConfig
      });

      sinon.assert.calledWith(AWS.CloudWatchLogs, clientConfig);
    });
  });

  describe('getAllLogGroups', function () {
    it('functions as expected', function (done) {
      janitor.getAllLogGroups(function (error, logGroups) {
        expect(logGroups).to.eql(logGroupObjects);
        done(error);
      });
    });
  });

  describe('getMatchingLogGroups', function () {
    var options;

    beforeEach(function () {
      options = {};
    });

    it('calls back with log groups for no filters', function (done) {
      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(logGroups).to.eql(logGroupObjects);

        sinon.assert.calledOnce(janitor.cwlClient.describeLogGroups);
        sinon.assert.calledWith(
          janitor.cwlClient.describeLogGroups,
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: undefined,
            nextToken: undefined
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('passes through options.prefix to API call', function (done) {
      var options = {
        prefix: 'prefix'
      };

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        sinon.assert.calledWith(
          janitor.cwlClient.describeLogGroups,
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: options.prefix,
            nextToken: undefined
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls back with filtered log groups by timestamp', function (done) {
      var options = {
        createdBefore: (new Date()).getTime() - 5000
      };

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(logGroups).to.eql(logGroupObjects.slice(2));

        sinon.assert.calledOnce(janitor.cwlClient.describeLogGroups);
        sinon.assert.calledWith(
          janitor.cwlClient.describeLogGroups,
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: undefined,
            nextToken: undefined
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls back with filtered log groups by date object', function (done) {
      var options = {
        createdBefore: new Date((new Date()).getTime() - 5000)
      };

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(logGroups).to.eql(logGroupObjects.slice(2));

        sinon.assert.calledOnce(janitor.cwlClient.describeLogGroups);
        sinon.assert.calledWith(
          janitor.cwlClient.describeLogGroups,
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: undefined,
            nextToken: undefined
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls back with filtered log groups by RegExp', function (done) {
      var options = {
        exclude: /\-[12]$/
      };

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(logGroups).to.eql(logGroupObjects.slice(2));

        sinon.assert.calledOnce(janitor.cwlClient.describeLogGroups);
        sinon.assert.calledWith(
          janitor.cwlClient.describeLogGroups,
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: undefined,
            nextToken: undefined
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls back with error for API error', function (done) {
      janitor.cwlClient.describeLogGroups.yields(new Error());

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(error).to.be.instanceOf(Error);
        done();
      });
    });

    it('handles multiple calls with nextToken', function (done) {
      var responses = [
        {
          logGroups: logGroupObjects.slice(1),
          nextToken: 'token1'
        },
        {
          logGroups: logGroupObjects.slice(2),
          nextToken: 'token2'
        },
        {
          logGroups: logGroupObjects.slice(3)
        }
      ];

      janitor.cwlClient.describeLogGroups.onCall(0).yields(null, responses[0]);
      janitor.cwlClient.describeLogGroups.onCall(1).yields(null, responses[1]);
      janitor.cwlClient.describeLogGroups.onCall(2).yields(null, responses[2]);

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(logGroups).to.eql([].concat(
          responses[0].logGroups,
          responses[1].logGroups,
          responses[2].logGroups
        ));

        expect(janitor.cwlClient.describeLogGroups.getCall(0).calledWith(
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: options.prefix,
            nextToken: undefined
          },
          sinon.match.func
        )).to.equal(true);

        expect(janitor.cwlClient.describeLogGroups.getCall(1).calledWith(
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: options.prefix,
            nextToken: responses[0].nextToken
          },
          sinon.match.func
        )).to.equal(true);

        expect(janitor.cwlClient.describeLogGroups.getCall(2).calledWith(
          {
            limit: janitor.describeLogGroupsLimit,
            logGroupNamePrefix: options.prefix,
            nextToken: responses[1].nextToken
          },
          sinon.match.func
        )).to.equal(true);

        done(error);
      });
    });

    it('calls back with error for bad options.createdBefore type', function (done) {
      options.createdBefore = {};

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(error).to.be.instanceOf(Error);
        done();
      });
    });

    it('calls back with error for bad options.exclude type', function (done) {
      options.exclude = 'string';

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(error).to.be.instanceOf(Error);
        done();
      });
    });

    it('calls back with error for bad options.prefix type', function (done) {
      options.prefix = {};

      janitor.getMatchingLogGroups(options, function (error, logGroups) {
        expect(error).to.be.instanceOf(Error);
        done();
      });
    });
  });

  describe('deleteLogGroup', function () {
    it('calls expected API function for object logGroup', function (done) {
      var logGroup = {
        logGroupName: 'name'
      };

      janitor.deleteLogGroup(logGroup, function (error) {
        sinon.assert.calledWith(
          janitor.cwlClient.deleteLogGroup,
          {
            logGroupName: logGroup.logGroupName
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls expected API function for string logGroup', function (done) {
      var logGroup = {
        logGroupName: 'name'
      };

      janitor.deleteLogGroup(logGroup.logGroupName, function (error) {
        sinon.assert.calledWith(
          janitor.cwlClient.deleteLogGroup,
          {
            logGroupName: logGroup.logGroupName
          },
          sinon.match.func
        );

        done(error);
      });
    });

    it('calls back with error for invalid logGroup type', function (done) {
      var badLogGroup = /a/;

      janitor.deleteLogGroup(badLogGroup, function (error) {
        expect(error).to.be.instanceOf(Error);
        sinon.assert.notCalled(janitor.cwlClient.deleteLogGroup);
        done();
      });
    });
  });

  describe('deleteLogGroups', function () {

    beforeEach(function () {
      sandbox.stub(janitor, 'deleteLogGroup').yields();
    });

    it('functions as expected for objects', function (done) {
      janitor.deleteLogGroups(logGroupObjects, function (error) {
        sinon.assert.callCount(janitor.deleteLogGroup, 4);
        sinon.assert.alwaysCalledWith(
          janitor.deleteLogGroup,
          sinon.match.object,
          sinon.match.func
        );

        done(error);
      })
    });

    it('functions as expected for strings', function (done) {
      janitor.deleteLogGroups(logGroupNames, function (error) {
        sinon.assert.callCount(janitor.deleteLogGroup, 4);
        sinon.assert.alwaysCalledWith(
          janitor.deleteLogGroup,
          sinon.match(/^[abcd]\-name/),
          sinon.match.func
        );

        done(error);
      })
    });

    it('calls back with error on deletion error', function (done) {
      janitor.deleteLogGroup.yields(new Error());
      janitor.deleteLogGroups(logGroupNames, function (error) {
        expect(error).to.be.instanceOf(Error);
        done();
      })
    });

    it('calls back with error if not provided an array', function (done) {
      janitor.deleteLogGroups({}, function (error) {
        expect(error).to.be.instanceOf(Error);
        done();
      })
    });

    it('calls back when provided array is empty', function (done) {
      janitor.deleteLogGroups([], function (error) {
        done(error);
      })
    });
  });

  describe('deleteMatchingLogGroups', function () {
    var options;

    beforeEach(function () {
      options = {
        prefix: 'prefix'
      };

      sandbox.stub(janitor, 'getMatchingLogGroups').yields(
        null,
        logGroupObjects
      );
      sandbox.stub(janitor, 'deleteLogGroups').yields();
    });

    it('functions as expected', function (done) {
      janitor.deleteMatchingLogGroups(options, function (error) {
        sinon.assert.calledWith(
          janitor.getMatchingLogGroups,
          options,
          sinon.match.func
        );
        sinon.assert.calledWith(
          janitor.deleteLogGroups,
          logGroupObjects,
          sinon.match.func
        );

        done(error);
      });
    });
  });
});

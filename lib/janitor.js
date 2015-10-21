/**
 * @fileOverview Main Janitor interface class.
 */

// NPM.
var AWS = require('aws-sdk');
var async = require('async');
var _ = require('lodash');

// --------------------------------------------------------------------------
// Class definition.
// --------------------------------------------------------------------------

/**
 * @class The main Janitor interface class.
 *
 * Note that the throttling rate for AWS CloudWatch Log operations is fairly
 * low, so it isn't a good plan to increase the concurrency much above 2.
 *
 * @param {Object} [config]
 * @param {Object} [config.clientConfig] Optional AWS client configuration.
 * @param {Number} [config.concurrency] Concurrency of AWS deletion operations.
 */
function Janitor (config) {
  this.config = _.defaults(config || {}, {
    concurrency: 2
  });

  if (this.config.clientConfig) {
    this.cwlClient = new AWS.CloudWatchLogs(this.config.clientConfig);
  }
  else {
    this.cwlClient = new AWS.CloudWatchLogs();
  }

  // Default maximum.
  this.describeLogGroupsLimit = 50;
}

// --------------------------------------------------------------------------
// Log group methods.
// --------------------------------------------------------------------------

/**
 * Obtain descriptions for all log groups in the account.
 *
 * @param {Function} callback Of the form function (error, Object[]).
 */
Janitor.prototype.getAllLogGroups = function (callback) {
  this.getMatchingLogGroups({}, callback);
}

/**
 * Obtain a list of log groups matching according to the provided options.
 *
 * Note that the log group name prefix filter is faster than other filter
 * options, as it doesn't have to load all log groups in the account to check
 * against their values.
 *
 * @param {Object} [options]
 * @param {Date|number} [options.createdBefore] A Date or millisecond timestamp.
 *   Only return log groups created before this timestamp.
 * @param {String} [options.prefix] A log group name prefix.
 * @param {Function} callback Of the form function (error, Object[]).
 */
Janitor.prototype.getMatchingLogGroups = function (options, callback) {
  var self = this;
  var logGroups = [];

  options = _.defaults(options || {}, {
    createdBefore: (new Date()).getTime()
  });

  if (_.isDate(options.createdBefore)) {
    options.createdBefore = options.createdBefore.getTime();
  }
  else if (!_.isNumber(options.createdBefore)) {
    return callback(new Error(
      'If provided, options.createdBefore must be a Date instance or millisecond timestamp number.'
    ));
  }

  if (!_.isString(options.prefix) && options.prefix !== undefined) {
    return callback(new Error(
      'If provided, options.prefix must be a string.'
    ));
  }

  function describeLogGroupsRecusively (token) {
    self.cwlClient.describeLogGroups({
      limit: self.describeLogGroupsLimit,
      logGroupNamePrefix: options.prefix,
      nextToken: token
    }, function (error, results) {
      if (error) {
        return callback(error);
      }

      // Winnow the log groups with the creation time filter.
      logGroups = logGroups.concat(_.filter(
        results.logGroups,
        function (logGroup) {
          return logGroup.creationTime < options.createdBefore;
        }
      ));

      if (results.nextToken) {
        describeLogGroupsRecusively(results.nextToken);
      }
      else {
        callback(null, logGroups);
      }
    });
  }

  // Start the recursive listing at the beginning, with no marker.
  describeLogGroupsRecusively();
};

/**
 * Delete this log group.
 *
 * @param {Object|String} logGroup A log group definition, as obtained from the
 *   describeLogGroups call. Or a log group name.
 * @param {Function} callback Of the form function (error).
 */
Janitor.prototype.deleteLogGroup = function (logGroup, callback) {
  if (_.isObject(logGroup) && _.isString(logGroup.logGroupName)) {
    logGroup = logGroup.logGroupName;
  }
  else if (!_.isString(logGroup)) {
    return callback(new Error(
      'The logGroup argument must be a log group name or log group object.'
    ));
  }

  this.cwlClient.deleteLogGroup({
    logGroupName: logGroup
  }, callback);
};

/**
 * Delete the specified log groups.
 *
 * @param {Object[]|String[]} Log group definitions, as obtained from the
 *   describeLogGroups SDK API, or log group names.
 * @param {Function} callback Of the form function (error).
 */
Janitor.prototype.deleteLogGroups = function (logGroups, callback) {
  if (!_.isArray(logGroups)) {
    return callback(new Error('Argument logGroups must be an array'));
  }
  else if (!logGroups.length) {
    return callback();
  }

  var self = this;
  var queue = async.queue(function (logGroup, asyncCallback) {
    self.deleteLogGroup(logGroup, asyncCallback);
  }, this.config.concurrency);

  callback = _.once(callback);
  queue.drain = callback;

  function onTaskCompletion (error) {
    if (error) {
      queue.kill();
      callback(error);
    }
  }

  _.each(logGroups, function (logGroup) {
    queue.push(logGroup, onTaskCompletion);
  });
};

/**
 * Delete all log groups in the account with names that have the provided
 * prefix.
 *
 * Note: specifying a prefix speeds things up, as cuts down on the number of
 * log groups that must be loaded, possibly via multiple sequential API calls.
 *
 * @param {Object} [options]
 * @param {Date|number} [options.createdBefore] A Date or millisecond timestamp.
 *   Only return log groups created before this timestamp.
 * @param {String} [options.prefix] A log group name prefix.
 * @param {Function} callback Of the form function (error).
 */
Janitor.prototype.deleteMatchingLogGroups = function (options, callback) {
  var self = this;

  async.waterfall([
    function (asyncCallback) {
      self.getMatchingLogGroups(options, asyncCallback);
    },
    _.bind(this.deleteLogGroups, this)
  ], callback);
};

// --------------------------------------------------------------------------
// Exports class definition.
// --------------------------------------------------------------------------

module.exports = Janitor;

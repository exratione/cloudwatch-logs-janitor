# CloudWatch Logs Janitor

A small module to streamline some of the cleanup operations required when when
working with AWS CloudWatch Logs, and especially when working with the default
log output created by Lambda functions.

To install:

```
npm install cloudwatch-logs-janitor
```

## Configuration

Janitor instances can be configured via parameters, or will read configuration
from the normal locations for the AWS SDK: environment variables, configuration
files, or instance metadata.

```
var Janitor = require('../cloudwatch-logs-janitor');

// Underlying AWS SDK client is configured with the provided parameters.
var janitor = new Janitor({
  clientConfig: {
    accessKeyId: 'akia',
    secretAccessKey: 'secret',
    region: 'us-east-1'
  }
});

// The underlying AWS SDK client obtains configuration automatically from the
// environment.
janitor = new Janitor();
```

## Cleaning Up Log Groups

CloudWatch log groups can easily turn into clutter, and it is painful to have to
manually delete the things during development. A developer might deploy hundreds
of different Lambda function instances in the course of any given week, and
every single one is going to create a log group and a bunch of log streams.

Listing log groups:

```
janitor.getAllLogGroups(function (error, logGroups) {
  if (error) {
    return console.error(error);
  }

  console.info(JSON.stringify(logGroups, null, '  '));
});

janitor.getMatchingLogGroups({
  // Only match log groups created prior to this Date instance.
  createdBefore: new Date(),
  // Exclude log groups with names matching this RegExp instance.
  exclude: /something|anything/i,
  // Only match log groups with names that begin with this prefix.
  prefix: '/aws/lambda/'
}, function (error, logGroups) {
  if (error) {
    return console.error(error);
  }

  console.info(JSON.stringify(logGroups, null, '  '));
});

```

Deleting log groups:

```
janitor.deleteLogGroup('exampleLogGroupName', function (error) {
  if (error) {
    return console.error(error);
  }

  console.info('Log group deleted.');
});

janitor.deleteLogGroups([
  'exampleLogGroupName',
  'anotherLogGroupName'
], function (error) {
  if (error) {
    return console.error(error);
  }

  console.info('Log groups deleted.');
});

janitor.deleteMatchingLogGroups({
  // Only match log groups created prior to this Date instance.
  createdBefore: new Date(),
  // Exclude log groups with names matching this RegExp instance.
  exclude: /something|anything/i,
  // Only match log groups with names that begin with this prefix.
  prefix: '/aws/lambda/'
}, function (error) {
  if (error) {
    return console.error(error);
  }

  console.info('Log groups deleted.');
});

```

When listing or deleting log groups, using the name prefix is much faster than
other filters. The prefix can be passed into the AWS API for listing log groups,
whereas the other filters require all of the log groups in the account to be
loaded for comparison. This can require multiple sequential API calls, as the
size limit placed on the response is small.

import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  type MetricAlarm,
} from "@aws-sdk/client-cloudwatch";

export default async function describeAlarms(
  client: CloudWatchClient,
  alarmNamePrefix: string,
): Promise<MetricAlarm[]> {
  const response = await client.send(
    new DescribeAlarmsCommand({ AlarmNamePrefix: alarmNamePrefix }),
  );
  return response.MetricAlarms ?? [];
}

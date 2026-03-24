# client-subscriptions-management

TypeScript CLI utility for managing NHS Notify client subscription configuration in S3.

## Usage

From the repository root run:

```bash
npm --workspace tools/client-subscriptions-management run <command> -- [options]
```

## Example

Deploy a message status subscription to the `dev` environment using a named AWS profile:

```bash
npm --workspace tools/client-subscriptions-management run deploy -- message \
  --environment dev \
  --profile my-profile \
  --client-id my-client \
  --message-statuses DELIVERED FAILED \
  --api-endpoint https://webhook.example.invalid/callbacks \
  --api-key 1234.4321 \
  --rate-limit 20 \
  --dry-run false
```

## Commands

### Deploy a Subscription

#### Message status

```bash
npm --workspace tools/client-subscriptions-management run deploy -- message \
  --environment dev \
  --client-id client-123 \
  --message-statuses DELIVERED FAILED \
  --api-endpoint https://webhook.example.invalid \
  --api-key-header-name x-api-key \
  --api-key 1234.4321 \
  --dry-run false \
  --rate-limit 20
```

#### Channel status

```bash
npm --workspace tools/client-subscriptions-management run deploy -- channel \
  --environment dev \
  --client-id client-123 \
  --channel-type EMAIL \
  --channel-statuses DELIVERED FAILED \
  --supplier-statuses READ REJECTED \
  --api-endpoint https://webhook.example.invalid \
  --api-key-header-name x-api-key \
  --api-key 1234.4321 \
  --dry-run false \
  --rate-limit 20
```

Optional for both: `--client-name "Test Client"` (defaults to client-id if not provided), `--project <name>` (defaults to `nhs`), `--region <region>` (defaults to `eu-west-2`), `--profile <aws-profile>`, `--bucket-name <name>` (override derived bucket name)

**Note (channel)**: At least one of `--channel-statuses` or `--supplier-statuses` must be provided.

### Get Client Subscriptions By Client ID

```bash
npm --workspace tools/client-subscriptions-management run get-by-client-id -- \
  --environment dev \
  --client-id client-123
```

### Put Message Status Subscription (S3 upload only)

```bash
npm --workspace tools/client-subscriptions-management run put-message-status -- \
  --environment dev \
  --client-id client-123 \
  --message-statuses DELIVERED FAILED \
  --api-endpoint https://webhook.example.invalid \
  --api-key-header-name x-api-key \
  --api-key 1234.4321 \
  --dry-run false \
  --rate-limit 20
```

Optional: `--client-name "Test Client"` (defaults to client-id if not provided), `--profile <aws-profile>`, `--bucket-name <name>`

### Put Channel Status Subscription (S3 upload only)

```bash
npm --workspace tools/client-subscriptions-management run put-channel-status -- \
  --environment dev \
  --client-id client-123 \
  --channel-type EMAIL \
  --channel-statuses DELIVERED FAILED \
  --supplier-statuses READ REJECTED \
  --api-endpoint https://webhook.example.invalid \
  --api-key-header-name x-api-key \
  --api-key 1234.4321 \
  --dry-run false \
  --rate-limit 20
```

Optional: `--client-name "Test Client"` (defaults to client-id if not provided), `--profile <aws-profile>`, `--bucket-name <name>`

**Note**: At least one of `--channel-statuses` or `--supplier-statuses` must be provided.

# AWS CloudFormation deployment (prepared, not deployed)

This is a separate, single-EC2 deployment for the existing Docker Compose
application. It creates its own PostgreSQL container and EBS-backed database
volume, and a generated database password in AWS Secrets Manager. It does not
read or modify Render configuration or data. It is a small demo/test setup, not
a highly available production architecture.

No AWS resources have been created from this template. The AWS CLI is not
installed in the workspace, and no AWS identity/account is available here, so
the template has not been deployed or validated against an account. Public AWS
documentation lists the services used here (EC2, EBS, VPC, IAM, Secrets Manager,
Systems Manager, and CloudFormation) as available on the Free plan for the new
AWS sign-up experience. That does **not** verify this particular account's
plan, remaining credits, region access, or quotas. See [AWS's supported-service
list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
and [Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/) for the current
general program rules.

## Application compatibility

The existing `Dockerfile` and `docker-compose.yaml` already build the frontend
and FastAPI service together, use PostgreSQL, apply migrations on startup, and
accept separate frontend origins. The bootstrap obtains the EC2 public hostname
and sets the customer and staff origins to the same host. **No shared application
changes are needed.** `render.yaml` and Render secrets/database remain untouched.

The endpoint is HTTP only. Browser push notifications require HTTPS, and
production authentication cookies are Secure only when requests use HTTPS. For
public use, add a domain and a TLS termination layer before treating this as a
production deployment. Do not add a TLS load balancer or paid services to the
Free plan stack.

## Free plan eligibility check

AWS's current Free plan is account-specific. New customers may receive up to
$200 in credits and a Free plan that ends after six months or when credits run
out; existing or previously closed AWS customers may not qualify. AWS says the
Free plan has no charges unless the account is upgraded or a paid-only service
is activated, but access is limited to selected services. The account's current
plan, credits, time remaining, and allowed services can only be checked in that
AWS account's Billing/Settings console. This workspace cannot establish the
account's personal eligibility.

Before creating a stack, sign in to the intended AWS account and check its plan
and remaining period/credits in Billing and Cost Management. Confirm that the
intended instance type and region are available. The new AWS experience's
public service list includes the services this template uses, but the signed-in
console is authoritative for the account. Do **not** select
Upgrade, activate advanced features, join AWS Organizations, or create a
resource/service the account says is unavailable. If any prerequisite is
unavailable, stop; this prepared template is not eligible for that account as
configured. A template cannot override AWS plan restrictions.

AWS also says a Free plan account closes when its credits are exhausted or its
six-month period ends; it retains resources/data for 90 days. Do not depend on
this deployment as a durable home for data.

## Cost estimate

Indicative US East (N. Virginia), 730 hours/month, on-demand list pricing,
before any account credits or Free plan restrictions. Prices checked
2026-11-03. The template defaults to `t3.small`; prices vary by region and date.

| Resource | Estimate per month |
| --- | ---: |
| EC2 `t3.small` (2 vCPU, 2 GiB) | about $15.26 |
| 30 GiB encrypted gp3 EBS volume | about $2.40 |
| One in-use public IPv4 address | about $3.65 |
| One Secrets Manager secret | about $0.40 plus API usage |
| CloudFormation, IAM role/profile, security group, SSM core | no separate baseline charge |
| **Estimated total** | **about $21.71/month** |

Internet data transfer, backups/snapshots, and any extra usage are not included.
The Free plan may prevent charges for its eligible usage, but that depends on
account status and service eligibility. Do not interpret this estimate as a
guarantee of Free Tier coverage. AWS publishes approximately $0.0209/hour for
`t3.small`, $0.08/GiB-month for gp3, $0.005/hour per public IPv4 address, and
$0.40/secret-month for Secrets Manager. See [EC2 pricing](https://aws.amazon.com/ec2/instance-types/t3/),
[EBS gp3 pricing](https://aws.amazon.com/ebs/general-purpose/),
[VPC public IPv4 pricing](https://aws.amazon.com/vpc/pricing/), and
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).
Check the live [AWS Pricing Calculator](https://calculator.aws/) for the
selected region/account before using the template.

## Prepare and deploy

1. Push this feature branch to the repository if the EC2 instance must clone
   it. Keep it separate from `main`; do not merge it as part of this task.
2. Complete the Free plan eligibility check above. If the account's console
   does not explicitly allow every required resource, stop without creating
   the stack.
3. In the AWS CloudFormation console, in the eligible region, create a stack
   using `aws/cloudformation.yaml`. Use a distinct stack name such as
   `kezek-aws-demo`. Leave `GitBranch` set to the branch containing the app
   source. The source repository must be public to allow the instance to clone
   it without a GitHub token.
4. Keep `InstanceType` at `t3.small` unless the selected Free plan explicitly
   permits another listed type. Do not add SSH access; the security group
   exposes only HTTP port 80. The database password is generated separately in
   Secrets Manager and is not a stack parameter or Render secret.
5. Wait for the stack to complete, then inspect EC2 **System Log** or connect
   with Systems Manager Session Manager and check
   `/var/log/kezek-bootstrap.log` and `docker compose ps` in `/opt/kezek`.
   The CloudFormation `ApplicationUrl` output is available after the stack is
   created; the site may need several minutes while Docker builds the app.
6. Before accepting real traffic, run the production account bootstrap using
   Session Manager. The command runs inside the app container and prompts for
   initial account passwords:

   ```sh
   cd /opt/kezek
   docker compose exec -it app python provision_production.py
   ```

7. Verify the customer site, staff login, API health at
   `/api/organizations`, and a disposable queue workflow. These checks must be
   performed on the deployed instance; configuration preparation is not
   deployment verification.

The stack uses one instance and its local PostgreSQL volume. Do not stop/start
the instance without rebuilding the frontend origins: the public hostname may
change. If the stack is deleted, the encrypted root volume is retained by
default (`DeleteOnTermination: false`), so detach/archive/delete it deliberately
after taking any needed backup to avoid orphaned storage and charges. The
Secrets Manager secret has a recovery window after deletion.

## Template validation

From the repository root, if `cfn-lint` is available:

```sh
cfn-lint aws/cloudformation.yaml
```

Template validation, stack creation, application health, and production
bootstrap are separate checkpoints. Record which ones actually succeeded.

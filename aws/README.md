# AWS CloudFormation deployment (prepared, not deployed)

This is a separate deployment for the existing Docker Compose application in
`us-east-1`. It runs on one EC2 host with its own PostgreSQL container and
encrypted EBS volume, and a generated database password in Secrets Manager.
CloudFront supplies the public HTTPS hostname; the EC2 origin accepts HTTP only
from the AWS-managed CloudFront origin-facing prefix list. It does not read or
modify Render configuration or data. This is a demo/test setup, not highly
available production infrastructure.

No AWS resources have been created. Identity, `us-east-1`, Free plan status,
and a $100 credit balance expiring 2027-05-03 were verified in the user's
account through AWS CLI. The app has not been deployed or health-checked. The
CloudFront flat-rate Free plan is unavailable to Free plan accounts; this
template therefore does not subscribe to a CloudFront pricing plan. The
pay-as-you-go CloudFront Free Tier currently lists 1 TB transfer and 10 million
requests/month, but account-specific service eligibility and quotas must still
be checked in the console.

## Application compatibility

The Docker Compose defaults preserve explicitly blank customer/staff origins so
both roles stay on one CloudFront hostname. The API recognizes CloudFront's
forwarded HTTPS scheme for same-origin sign-in and sets Secure session cookies.
CloudFront forwards the viewer Host, cookies, query strings, and
CloudFront-Forwarded-Proto; API caching is disabled. `render.yaml` and Render
secrets/database remain untouched.

## Free plan eligibility check

The account plan, status, credits, and expiry were verified through the AWS
Free Tier API. The API does not confirm every service-specific eligibility
rule, quota, or current instance availability; those require the signed-in
Console's Free Tier and service pages. AWS's current supported-service list
includes the template's core services (CloudFront, EC2/EBS/VPC, CloudFormation,
IAM, Secrets Manager, and Systems Manager) in the new Free Tier account
experience. This confirms general service availability, not this account's
specific quota or feature eligibility. See [AWS supported services](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html).

Before creating a stack, recheck the account's balance in Billing and Cost
Management / Free Tier, then confirm the selected instance and CloudFront
pay-as-you-go service are available for this account. The deployment region is
the verified home Region `us-east-1`. Do **not** select
Upgrade, activate advanced features, join AWS Organizations, or create a
resource/service the account says is unavailable. If any prerequisite is
unavailable, stop; this prepared template is not eligible for that account as
configured. A template cannot override AWS plan restrictions.

AWS also says a Free plan account closes when its credits are exhausted or its
six-month period ends; it retains resources/data for 90 days. Do not depend on
this deployment as a durable home for data.

## Install AWS CLI and authenticate from WSL

Run these commands in your WSL Ubuntu terminal. The official AWS CLI v2
installer needs `curl`, `unzip`, and `sudo`; it does not create or store AWS
credentials:

```sh
sudo apt-get update
sudo apt-get install -y curl unzip
mkdir -p "$HOME/tmp/aws-cli"
cd "$HOME/tmp/aws-cli"
curl -fL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip
unzip -q awscliv2.zip
sudo ./aws/install
aws --version
```

For ARM64 WSL, use `awscli-exe-linux-aarch64.zip` in the download URL instead.
The installed CLI version must be 2.32.0 or newer for `aws login`.

Choose the path that matches your account:

* **Personal AWS account using console sign-in (recommended here):** log in to
  the AWS Console with the account's root user or an IAM user, then in WSL run
  `aws login --profile kezek-free --region YOUR_PROJECT_REGION`, replacing the
  placeholder with the home Region shown in AWS Settings. Complete sign-in in the
  browser. For an IAM user, AWS requires the `SignInLocalDevelopmentAccess`
  permission. This obtains temporary credentials. Do not create root access
  keys. If WSL cannot launch the browser, use
  `aws login --remote --profile kezek-free --region YOUR_PROJECT_REGION`, open its printed
  URL in Windows, and enter the one-time authorization code in WSL.
* **Existing IAM Identity Center access portal:** run
  `aws configure sso --profile kezek-free`, follow the prompts using the
  existing start URL/issuer URL, SSO region, account, and assigned role, then
  run `aws sso login --profile kezek-free`. This also uses temporary credentials
  and refreshes them during an active SSO session. Do not create/join an AWS
  Organization to obtain SSO for this deployment; that can automatically
  upgrade a Free plan account.

Do not use `aws configure` with long-lived access keys unless your AWS
administrator has no temporary-credential option. Never create root access
keys, and do not paste credentials or browser authorization codes into chat.

This project's verified home Region is `us-east-1`. Set the CLI deployment
region to that value, then verify identity and account plan. The Free Tier
account-plan API also uses `us-east-1`.

```sh
aws configure set region YOUR_PROJECT_REGION --profile kezek-free
aws sts get-caller-identity --profile kezek-free --output json
aws configure get region --profile kezek-free
aws freetier get-account-plan-state --region us-east-1 --profile kezek-free --output json
```

Replace `YOUR_PROJECT_REGION` with `us-east-1`. The identity
response contains account ID and ARN (safe to share for verification; it
contains no credentials). The plan-state API returns `accountPlanType`,
`accountPlanStatus`, remaining credit amount, and expiration date. It requires
`freetier:GetAccountPlanState`; if the command is denied or unavailable, use the
AWS Console checks below. Confirm the account ID is the intended AWS account,
the configured region matches the project home Region, plan type is `FREE`, plan
status is `ACTIVE`, and credits/time remaining are acceptable before proceeding.
Do not run CloudFormation create/execute commands yet.

In the Console, check **Billing and Cost Management / AWS Settings** for plan
type, status, credit balance, and expiration. Check **Free Tier** for current
usage and eligible limits. Account-specific quotas and region access are not
fully represented by the plan-state API. If any required resource is disallowed
or a plan upgrade is prompted, stop; do not upgrade.

## Cost estimate

Indicative US East (N. Virginia), 730 hours/month, on-demand list pricing,
before account credits or plan-specific limits. Prices checked 2026-11-03.
The template defaults to `t3.small`; prices and eligibility can change.

| Resource | Estimate per month |
| --- | ---: |
| EC2 `t3.small` (2 vCPU, 2 GiB) | about $15.26 |
| 30 GiB encrypted gp3 EBS volume | about $2.40 |
| One in-use public IPv4 address | about $3.65 |
| One Secrets Manager secret | about $0.40 plus API usage |
| CloudFront pay-as-you-go | $0 while within eligible 1 TB transfer / 10 million requests monthly; overage varies by viewer location |
| CloudFormation, IAM role/profile, security group, SSM core | no separate baseline charge |
| **Estimated total** | **about $21.71/month baseline**, assuming CloudFront free usage applies and is not exceeded |

This template declares exactly these 13 CloudFormation resources:

| Logical ID | CloudFormation type | Purpose |
| --- | --- | --- |
| `DatabaseSecret` | `AWS::SecretsManager::Secret` | Generated, AWS-only PostgreSQL password |
| `InstanceRole` | `AWS::IAM::Role` | EC2 access to SSM and the one database secret |
| `InstanceProfile` | `AWS::IAM::InstanceProfile` | Attaches the role to EC2 |
| `AppVpc` | `AWS::EC2::VPC` | Isolated AWS network |
| `InternetGateway` | `AWS::EC2::InternetGateway` | Public internet route for the host |
| `InternetGatewayAttachment` | `AWS::EC2::VPCGatewayAttachment` | Attaches the gateway to the VPC |
| `PublicSubnet` | `AWS::EC2::Subnet` | One public subnet in one AZ |
| `PublicRouteTable` | `AWS::EC2::RouteTable` | Subnet routing table |
| `PublicRoute` | `AWS::EC2::Route` | Default route through the gateway |
| `PublicSubnetRouteTableAssociation` | `AWS::EC2::SubnetRouteTableAssociation` | Associates the route table with the subnet |
| `WebSecurityGroup` | `AWS::EC2::SecurityGroup` | Allows inbound HTTP 80 only from CloudFront's managed prefix list; no SSH/database ingress |
| `AppServer` | `AWS::EC2::Instance` | Runs app and PostgreSQL containers; includes an encrypted 30 GiB gp3 root volume and one public IPv4 address |
| `CloudFrontDistribution` | `AWS::CloudFront::Distribution` | Public HTTPS endpoint, security response headers, disabled caching, global access |

There is no RDS, load balancer, NAT gateway, Route 53 domain, custom ACM
certificate, backup schedule, WAF rule set, or autoscaling group. CloudFront's
default certificate provides HTTPS for its assigned hostname. PostgreSQL is a
container on the EC2 root volume, so this is a single-host availability and
backup risk. The managed CloudFront prefix list permits origin traffic from
CloudFront origin-facing servers generally; it does not identify this specific
distribution. Its weight is 55 security-group rules, close to the default
inbound quota of 60.

Backups/snapshots, CloudFront usage above the eligible allowance, and other
extra usage are not included. Account-specific resource eligibility must be
checked in the Console; this is not a guarantee of Free Tier coverage. AWS
publishes approximately $0.0209/hour for
`t3.small`, $0.08/GiB-month for gp3, $0.005/hour per public IPv4 address, and
$0.40/secret-month for Secrets Manager. See [EC2 pricing](https://aws.amazon.com/ec2/instance-types/t3/),
[EBS gp3 pricing](https://aws.amazon.com/ebs/general-purpose/),
[VPC public IPv4 pricing](https://aws.amazon.com/vpc/pricing/), and
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).
Check the live [AWS Pricing Calculator](https://calculator.aws/) and account's
Free Tier page before using the template. CloudFront's flat-rate Free plan is
unavailable to AWS Free plan accounts; do not choose a paid CloudFront plan.

At this reference baseline, six months would use about $130.26 of credits,
before CloudFront overages or backups. A $100 credit balance would last about
4.6 months if this workload ran continuously and the estimate applies. This
is not a spend cap. AWS states that a Free
plan account closes when credits run out;
the service will become unavailable unless the account is upgraded. Keep the
account on Free and plan to stop/delete the stack before the credits are
exhausted, or do not create it.

## Prepare and deploy

1. Push this feature branch to the repository if the EC2 instance must clone
   it. Keep it separate from `main`; do not merge it as part of this task.
2. Complete the Free plan eligibility check above. If the account's console
   does not explicitly allow every required resource, stop without creating
   the stack.
3. Review this resource list, costs, and account-specific eligibility before
   creating the stack. The template does not enforce a billing cap.
4. In the AWS CloudFormation console, in `us-east-1`, create a stack
   using `aws/cloudformation.yaml`. Use a distinct stack name such as
   `kezek-aws-demo`. Leave `GitBranch` set to the branch containing the app
   source. The source repository must be public to allow the instance to clone
   it without a GitHub token.
5. Keep `InstanceType` at `t3.small` unless the selected Free plan explicitly
   permits another listed type. Do not add SSH access; the security group
   exposes only HTTP port 80. The database password is generated separately in
   Secrets Manager and is not a stack parameter or Render secret.
6. Wait for the stack to complete, then inspect EC2 **System Log** or connect
   with Systems Manager Session Manager and check
   `/var/log/kezek-bootstrap.log` and `docker compose ps` in `/opt/kezek`.
   The CloudFormation `ApplicationUrl` output is available after the stack is
   created; the site may need several minutes while Docker builds the app.
7. Before accepting real traffic, run the production account bootstrap using
   Session Manager. The command runs inside the app container and prompts for
   initial account passwords:

   ```sh
   cd /opt/kezek
   docker compose exec -it app python provision_production.py
   ```

8. Verify the customer site, staff login, API health at
   `/api/organizations`, and a disposable queue workflow. These checks must be
   performed on the deployed instance; configuration preparation is not
   deployment verification.

The stack uses one instance and its local PostgreSQL volume. Stopping and
starting EC2 can change its public hostname, requiring the CloudFront origin to
be updated. If the stack is deleted, the encrypted root volume is retained by
default (`DeleteOnTermination: false`), so detach/archive/delete it deliberately
after taking any needed backup to avoid orphaned storage and charges. The
Secrets Manager secret has a recovery window after deletion.

## Template validation

From the repository root:

```sh
cfn-lint aws/cloudformation.yaml
cfn-guard validate --rules aws/cloudformation.guard --data aws/cloudformation.yaml
```

Template validation, stack creation, application health, and production
bootstrap are separate checkpoints. Record which ones actually succeeded.

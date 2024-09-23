# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

## Initial Bootstrap

Add profiles via sso, for beta and prod:
- https://d-9067e380aa.awsapps.com/start/
- `aws configure sso`
- `aws sso login --profile <new profile>`

Bootstrap the new beta account:
```
cdk bootstrap --profile <new beta profile>
```

Bootstrap the root account to trust / have a support stack for this pipeline:
```
cdk bootstrap aws://568614994890/us-east-1 --trust <new beta account>  --profile <new beta profile>
```

Bootstrap the new prod account:
```
cdk bootstrap aws://<new prod account>/us-east-1 --trust <new beta account> --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess  --profile <new prod profile>
```

Deploy the pipeline
```
cdk deploy <pipeline stack> --profile <new beta profile>
```
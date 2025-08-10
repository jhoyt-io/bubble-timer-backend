import { Construct } from 'constructs';
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { BubbleTimerApplication } from './bubble-timer-application';
import { Stack, StackProps } from 'aws-cdk-lib';

export class BubbleTimerPipelineStack extends Stack {
  static PIPELINE_ACCOUNT: string = '897729117121';
  static ROOT_ACCOUNT: string = '568614994890';
  static BETA_ACCOUNT: string = '897729117121';
  static PROD_ACCOUNT: string = '586794474099';

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cdkRepository = Repository.fromRepositoryArn(
      this, 
      'CDKRepository',
      `arn:aws:codecommit:us-east-1:${BubbleTimerPipelineStack.ROOT_ACCOUNT}:bubble-timer-backend`
    );
    const cdkSourceOutput = new Artifact();

    const pipeline = new CodePipeline(this, 'Pipeline', {
      selfMutation: true,
      dockerEnabledForSelfMutation: true,
      dockerEnabledForSynth: true,
      codeBuildDefaults: {
        rolePolicy: [
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:aws:iam::${BubbleTimerPipelineStack.ROOT_ACCOUNT}:role/*`,
              `arn:aws:iam::${BubbleTimerPipelineStack.BETA_ACCOUNT}:role/*`,
              `arn:aws:iam::${BubbleTimerPipelineStack.PROD_ACCOUNT}:role/*`,
            ]
          }),
        ]
      },
      crossAccountKeys: true,
      synth: new CodeBuildStep('Synth', {
        input: CodePipelineSource.codeCommit(cdkRepository, 'mainline'),
        partialBuildSpec: BuildSpec.fromObject({
          version: '0.2',
          env: {
            shell: 'bash',
          }
        }),
        commands: [
          'npm ci',
          'npm run build',
          'npx cdk synth',
        ],
      }),
    });

    const BubbleTimerBeta = new BubbleTimerApplication(this, 'Beta', {
    });

    const betaStage = pipeline.addStage(BubbleTimerBeta, {
    });

    const BubbleTimerProd = new BubbleTimerApplication(this, 'Prod', {
      env: {
        account: BubbleTimerPipelineStack.PROD_ACCOUNT,
        region: 'us-east-1',
      }
    });

    const prodStage = pipeline.addStage(BubbleTimerProd, {
    });
  }
}
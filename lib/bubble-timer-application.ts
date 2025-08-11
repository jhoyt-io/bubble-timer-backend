import { CfnOutput, Stage, StageProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BackendStack } from "./bubble-timer-backend-stack";
import { BubbleTimerUsersStack } from "./bubble-timer-users-stack";
import { BubbleTimerDNSStack } from "./bubble-timer-dns-stack";

export interface BubbleTimerStageProps extends StageProps {
}

export class BubbleTimerApplication extends Stage {
    constructor(scope: Construct, stageName: string, props: BubbleTimerStageProps) {
        super(scope, stageName, props);

        const bubbleTimerWebsiteStack = new BubbleTimerDNSStack(this, 'BubbleTimerWebsite', {
            stageName,
        });

        const bubbleTimerUsersStack = new BubbleTimerUsersStack(this, 'BubbleTimerUsers', {
            stageName,
            domainName: bubbleTimerWebsiteStack.domainName,
        });

        // Platform Application ARNs for different environments
        const platformApplicationArns = {
            'Beta': 'arn:aws:sns:us-east-1:897729117121:app/GCM/BubbleTimer-Beta',
            'Prod': 'arn:aws:sns:us-east-1:586794474099:app/GCM/BubbleTimer-Prod',
        };

        const snsPlatformApplicationArn = platformApplicationArns[stageName as keyof typeof platformApplicationArns];
        
        if (!snsPlatformApplicationArn) {
            throw new Error(`No Platform Application ARN configured for stage: ${stageName}`);
        }

        new BackendStack(this, 'BubbleTimerBackend', {
            userPoolArn: bubbleTimerUsersStack.userPoolArn,
            snsPlatformApplicationArn,
        });
    }
}
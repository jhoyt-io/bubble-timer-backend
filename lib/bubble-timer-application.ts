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

        new BackendStack(this, 'BubbleTimerBackend', {
            userPoolArn: bubbleTimerUsersStack.userPoolArn,
        });
    }
}
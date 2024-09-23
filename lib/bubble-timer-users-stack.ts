import { Construct } from "constructs";
import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { UserPool, StringAttribute } from "aws-cdk-lib/aws-cognito";

interface BubbleTimerUsersStackProps extends StackProps {
    readonly stageName: string;
    readonly domainName: string;
}

export class BubbleTimerUsersStack extends Stack {
    readonly userPoolArn: string;

    constructor(app: Construct, stackName: string, props: BubbleTimerUsersStackProps) {
        super(app, stackName, props);

        const userPool = new UserPool(this, 'UserPool', {
            userPoolName: 'bubble-timer-users',
            selfSignUpEnabled: false,
            userInvitation: {
                emailSubject: 'Invitation to join Bubble Timer',
                emailBody: 'Hello {username}, you have been invited to join the Bubble Timer app! Your temporary password is {####}',
            },
            signInAliases: {
                username: true, 
                email: true,
            },
            autoVerify: {
                email: true,
            },
            customAttributes: {
                'userName': new StringAttribute({minLen: 1, maxLen: 69, mutable: true}),
            },
        });

        this.userPoolArn = userPool.userPoolArn;

        const cognitoDomainPrefix = `jhoytio-bubble-timer-${props.stageName.toLowerCase()}`
        userPool.addDomain('CognitoDomain', {
            cognitoDomain: {
                domainPrefix: cognitoDomainPrefix,
            },
        });

        const userPoolClient = userPool.addClient(`website-${props.stageName.toLowerCase()}`, {
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                callbackUrls: [
                    `https://${props.domainName}/`,
                    `http://localhost:4000`,
                ]
            }
        });

        new CfnOutput(this, 'LoginUrl', {
            value: `https://${cognitoDomainPrefix}.auth.us-east-1.amazoncognito.com/login?` +
                `response_type=code&client_id=${userPoolClient.userPoolClientId}&` +
                `redirect_uri=https://${props.domainName}/`,
        });
    }
}
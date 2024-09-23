import { Construct } from "constructs";
import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { 
    CrossAccountZoneDelegationRecord, 
    PublicHostedZone, 
} from "aws-cdk-lib/aws-route53";
import { Role } from "aws-cdk-lib/aws-iam";
// should be ok to keep using: https://github.com/aws/aws-cdk/discussions/23952
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import { BubbleTimerPipelineStack } from "./bubble-timer-pipeline-stack";

export interface BubbleTimerStackProps extends StackProps {
    readonly stageName: string;
}

export class BubbleTimerDNSStack extends Stack {
    readonly domainName: string;
    readonly websiteDistributionIdOutput: CfnOutput;
    readonly invalidationRoleArnOutput: CfnOutput;
    readonly websiteAccessLogsBucketName: string;

    constructor(app: Construct, stackName: string, props: BubbleTimerStackProps) {
        super(app, stackName, props);

        const stageName = props.stageName;
        this.domainName = (stageName == 'Prod') ? 
            'bubble-timer.jhoyt.io' :
            `${stageName.toLowerCase()}.bubble-timer.jhoyt.io`;

        const hostedZone = new PublicHostedZone(this, 'Subdomain', {
            zoneName: this.domainName,
        });

        const delegationRole = Role.fromRoleArn(this, 'DelegationRole', Stack.of(this).formatArn({
            region: '',
            service: 'iam',
            account: BubbleTimerPipelineStack.ROOT_ACCOUNT,
            resource: 'role',
            resourceName: 'SubdomainDelegationRole',
        }));

        new CrossAccountZoneDelegationRecord(this, 'Delegation', {
            delegatedZone: hostedZone,
            parentHostedZoneId: 'Z08086922KD11SFB8MXO1',
            delegationRole,
        });

        new DnsValidatedCertificate(this, 'WebsiteCert', {
            domainName: this.domainName,
            hostedZone,
        });
    }
}
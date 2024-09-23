import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Stack, StackProps } from "aws-cdk-lib";
import { AuthorizationType, CognitoUserPoolsAuthorizer, CorsOptions, LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";

export interface BackendStackProps extends StackProps {
    readonly userPoolArn: string;
}

export class BackendStack extends Stack {
    defaultCorsPreflightOptions: CorsOptions = {
        allowHeaders: [
            'Content-Type',
            'X-Amz-Date',
            'Authorization',
            'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['http://localhost:4000'],
    };

    constructor(app: Construct, stackName: string, props: BackendStackProps) {
        super(app, stackName, props);

        const apiBackendFunction = new NodejsFunction(this, 'api');

        const auth = new CognitoUserPoolsAuthorizer(this, 'apiAuthorizer', {
            cognitoUserPools: [
                UserPool.fromUserPoolArn(this, 'UserPool', props.userPoolArn),
            ],
        });

        const restApi = new LambdaRestApi(this, 'API', {
            handler: apiBackendFunction,
            proxy: false,
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });

        restApi.root.addMethod('ANY', undefined, {
            authorizer: auth,
            authorizationType: AuthorizationType.COGNITO,
        });

        const timersResource = restApi.root.addResource('timers', {
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });
        timersResource.addMethod('ANY', undefined, {
            authorizer: auth,
            authorizationType: AuthorizationType.COGNITO,
        });

        const timerResource = timersResource.addResource('{timer}', {
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });
        timerResource.addMethod('ANY', undefined, {
            authorizer: auth,
            authorizationType: AuthorizationType.COGNITO,
        });

        // DDB TABLES
        const timersTable = new Table(this, 'Timers', {
            partitionKey: {
                name: 'id', type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
        });
        timersTable.addGlobalSecondaryIndex({
            indexName: 'TimersByUser',
            partitionKey: {
                name: 'user_id', type: AttributeType.STRING
            },
            sortKey: {
                name: 'id', type: AttributeType.STRING
            },
        });
        timersTable.grantFullAccess(apiBackendFunction);
        apiBackendFunction.addEnvironment('TIMERS_TABLE_NAME', timersTable.tableName);

        // JOIN TABLES
    }
}
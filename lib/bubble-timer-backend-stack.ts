import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Stack, StackProps } from "aws-cdk-lib";
import { AuthorizationType, CognitoUserPoolsAuthorizer, CorsOptions, LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import { WebSocketApi, WebSocketAuthorizer, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";


export interface BackendStackProps extends StackProps {
    readonly userPoolArn: string;
    readonly snsPlatformApplicationArn: string;
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

        const userPool = UserPool.fromUserPoolArn(this, 'UserPool', props.userPoolArn);

        // REST API
        const apiBackendFunction = new NodejsFunction(this, 'api');

        const auth = new CognitoUserPoolsAuthorizer(this, 'apiAuthorizer', {
            cognitoUserPools: [ userPool ],
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

        const sharedTimersResource = timersResource.addResource('shared', {
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });
        sharedTimersResource.addMethod('ANY', undefined, {
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

        // Device Tokens API endpoints
        const deviceTokensResource = restApi.root.addResource('device-tokens', {
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });
        deviceTokensResource.addMethod('ANY', undefined, {
            authorizer: auth,
            authorizationType: AuthorizationType.COGNITO,
        });

        const deviceTokenResource = deviceTokensResource.addResource('{deviceId}', {
            defaultCorsPreflightOptions: this.defaultCorsPreflightOptions,
        });
        deviceTokenResource.addMethod('ANY', undefined, {
            authorizer: auth,
            authorizationType: AuthorizationType.COGNITO,
        });

        // WebSocket API
        const webSocketBackendFunction = new NodejsFunction(this, 'websocket');
        const webSocketApi = new WebSocketApi(this, 'WebsocketAPI', {
            connectRouteOptions: {
                integration: new WebSocketLambdaIntegration('ConnectIntegration', webSocketBackendFunction),
            },
            disconnectRouteOptions: {
                integration: new WebSocketLambdaIntegration('DisconnectIntegration', webSocketBackendFunction),
            },
            defaultRouteOptions: {
                integration: new WebSocketLambdaIntegration('DefaultIntegration', webSocketBackendFunction),
            },
        });
        webSocketApi.grantManageConnections(webSocketBackendFunction);

        webSocketApi.addRoute('sendmessage', {
            integration: new WebSocketLambdaIntegration('SendMessageIntegration', webSocketBackendFunction),
        });

        new WebSocketStage(this, 'WebsocketAPIStage', {
            webSocketApi,
            stageName: 'prod',
            autoDeploy: true,
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
        timersTable.grantFullAccess(webSocketBackendFunction);
        apiBackendFunction.addEnvironment('TIMERS_TABLE_NAME', timersTable.tableName);
        webSocketBackendFunction.addEnvironment('TIMERS_TABLE_NAME', timersTable.tableName);

        const userConnectionsTable = new Table(this, 'UserConnections', {
            partitionKey: {
                name: 'user_id', type: AttributeType.STRING
            },
            sortKey: {
                name: 'device_id', type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
        });
        userConnectionsTable.addGlobalSecondaryIndex({
            indexName: 'ConnectionsByConnectionId',
            partitionKey: {
                name: 'connection_id', type: AttributeType.STRING
            },
        })
        userConnectionsTable.grantFullAccess(webSocketBackendFunction);
        webSocketBackendFunction.addEnvironment('USER_CONNECTIONS_TABLE_NAME', userConnectionsTable.tableName);

        // Shared Timer Relationships Table
        const sharedTimersTable = new Table(this, 'SharedTimers', {
            partitionKey: {
                name: 'shared_with_user', type: AttributeType.STRING
            },
            sortKey: {
                name: 'timer_id', type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
        });
        sharedTimersTable.addGlobalSecondaryIndex({
            indexName: 'TimerIdIndex',
            partitionKey: {
                name: 'timer_id', type: AttributeType.STRING
            },
            sortKey: {
                name: 'shared_with_user', type: AttributeType.STRING
            },
        });
        sharedTimersTable.grantFullAccess(apiBackendFunction);
        sharedTimersTable.grantFullAccess(webSocketBackendFunction);
        apiBackendFunction.addEnvironment('SHARED_TIMERS_TABLE_NAME', sharedTimersTable.tableName);
        webSocketBackendFunction.addEnvironment('SHARED_TIMERS_TABLE_NAME', sharedTimersTable.tableName);

        // Device Tokens Table for Push Notifications
        const deviceTokensTable = new Table(this, 'DeviceTokens', {
            partitionKey: {
                name: 'user_id', type: AttributeType.STRING
            },
            sortKey: {
                name: 'device_id', type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
        });
        deviceTokensTable.addGlobalSecondaryIndex({
            indexName: 'DeviceIdIndex',
            partitionKey: {
                name: 'device_id', type: AttributeType.STRING
            },
            sortKey: {
                name: 'user_id', type: AttributeType.STRING
            },
        });
        deviceTokensTable.grantFullAccess(apiBackendFunction);
        deviceTokensTable.grantFullAccess(webSocketBackendFunction);
        apiBackendFunction.addEnvironment('DEVICE_TOKENS_TABLE_NAME', deviceTokensTable.tableName);
        webSocketBackendFunction.addEnvironment('DEVICE_TOKENS_TABLE_NAME', deviceTokensTable.tableName);

        // SNS Platform Application for Android (FCM)
        // Note: Platform Application is created manually and passed in via props
        // This allows for environment-specific Platform Applications (beta/prod)

        // Grant SNS permissions to Lambda functions
        const snsPolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                'sns:Publish',
                'sns:CreatePlatformEndpoint',
                'sns:DeleteEndpoint',
                'sns:GetEndpointAttributes',
                'sns:SetEndpointAttributes',
            ],
            resources: [
                props.snsPlatformApplicationArn,
                `${props.snsPlatformApplicationArn}/*`,
            ],
        });

        apiBackendFunction.addToRolePolicy(snsPolicy);
        webSocketBackendFunction.addToRolePolicy(snsPolicy);

        // Add SNS environment variables
        apiBackendFunction.addEnvironment('SNS_PLATFORM_APPLICATION_ARN', props.snsPlatformApplicationArn);
        webSocketBackendFunction.addEnvironment('SNS_PLATFORM_APPLICATION_ARN', props.snsPlatformApplicationArn);

        // JOIN TABLES
    }
}
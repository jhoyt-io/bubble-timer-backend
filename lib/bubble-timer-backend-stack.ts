import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Stack, StackProps } from "aws-cdk-lib";
import { AuthorizationType, CognitoUserPoolsAuthorizer, CorsOptions, LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import { WebSocketApi, WebSocketAuthorizer, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

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
        
        // Environment variables for the new architecture
        const environmentVariables = {
            'TIMERS_TABLE_NAME': timersTable.tableName,
            'NODE_ENV': 'production',
            'AWS_REGION': this.region,
            'LOG_LEVEL': 'info',
            'CORS_ORIGIN': 'http://localhost:4000', // Update this for production
        };
        
        Object.entries(environmentVariables).forEach(([key, value]) => {
            apiBackendFunction.addEnvironment(key, value);
            webSocketBackendFunction.addEnvironment(key, value);
        });

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
        
        // Add user connections table to environment
        const userConnectionEnvVars = {
            'USER_CONNECTIONS_TABLE_NAME': userConnectionsTable.tableName,
        };
        
        Object.entries(userConnectionEnvVars).forEach(([key, value]) => {
            apiBackendFunction.addEnvironment(key, value);
            webSocketBackendFunction.addEnvironment(key, value);
        });

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
        
        // Add shared timers table and additional configuration to environment
        const sharedTimersEnvVars = {
            'SHARED_TIMERS_TABLE_NAME': sharedTimersTable.tableName,
            'COGNITO_USER_POOL_ID': userPool.userPoolId,
            'COGNITO_CLIENT_ID': '', // Will need to be set based on your Cognito setup
            'WEBSOCKET_ENDPOINT': webSocketApi.apiEndpoint,
        };
        
        Object.entries(sharedTimersEnvVars).forEach(([key, value]) => {
            if (value) { // Only add non-empty values
                apiBackendFunction.addEnvironment(key, value);
                webSocketBackendFunction.addEnvironment(key, value);
            }
        });


        // JOIN TABLES
    }
}
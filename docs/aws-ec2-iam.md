# Políticas IAM mínimas para o deploy EC2

Substitua `<ACCOUNT_ID>`, `<REGION>`, `<INSTANCE_ID>` e `<ECR_REPOSITORY>` pelos valores da sua conta. Use a mesma região para EC2 e ECR.

## 1. Provedor OIDC

Em IAM → Identity providers, crie `token.actions.githubusercontent.com` com audience `sts.amazonaws.com`, caso ainda não exista. A role de deploy deve confiar somente neste repositório, no environment `production` e em pushes da branch `main`.

Trust policy da role GitHub Actions:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:LuisBarbosaGit/Zombiees.io:environment:production",
        "token.actions.githubusercontent.com:ref": "refs/heads/main"
      }
    }
  }]
}
```

## 2. Policy da role GitHub Actions

Anexe esta policy à role acima. Ela permite enviar a imagem ao único ECR do jogo e executar o documento de deploy somente na instância indicada. `GetCommandInvocation` usa `Resource: "*"` porque a API não oferece restrição por recurso para essa ação.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushGameImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/<ECR_REPOSITORY>"
    },
    {
      "Sid": "DeployOnlyToGameServer",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:<REGION>::document/AWS-RunShellScript",
        "arn:aws:ec2:<REGION>:<ACCOUNT_ID>:instance/<INSTANCE_ID>"
      ]
    },
    {
      "Sid": "ReadCommandResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

## 3. Instance profile da EC2

Crie uma role para EC2 e anexe a policy gerenciada `AmazonSSMManagedInstanceCore`. Anexe também esta policy de pull do ECR; substitua os mesmos placeholders:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PullGameImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/<ECR_REPOSITORY>"
    }
  ]
}
```

A role da instância não recebe permissões de escrita no ECR; a role do GitHub Actions não recebe permissões de pull/deploy para outras instâncias.

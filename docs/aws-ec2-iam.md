# Deploy manual na EC2 com seu perfil AWS

Este fluxo não cria role/profile para a instância nem configura credenciais no GitHub Actions. O pipeline do GitHub só testa e valida os builds. Você inicia o deploy no seu computador com o perfil AWS pessoal já configurado e acessa a EC2 pela sua chave SSH.

## Preparar uma vez

1. Crie uma EC2 Ubuntu 24.04 LTS x86_64 e guarde o arquivo de chave `.pem` usado na criação. No Security Group, permita SSH (TCP 22) somente do seu IP e TCP 3001 somente do Security Group do Application Load Balancer. Não exponha SSH ou 3001 para `0.0.0.0/0`.
2. Instale Docker Engine e Docker Compose v2 na EC2. Crie `/opt/zombies-io/.env` contendo `SUPABASE_URL`, `DATABASE_URL`, `DATABASE_SSL=true` e `WEB_ORIGIN`, e proteja-o com `sudo chmod 600 /opt/zombies-io/.env`. Crie `/opt/zombies-io` e permita que o usuário SSH execute Docker.
3. Crie um repositório privado ECR, por exemplo `zombies-io-backend`. Configure um ALB HTTPS com certificado ACM e target group HTTP apontando para a EC2 na porta 3001, com health check `/api/health`.
4. No IAM, use sua identidade/perfil AWS pessoal existente. Dê a ela somente as permissões ECR da policy abaixo (ou equivalentes). Não configure OIDC, role de deploy, role/profile de instância, SSM ou secrets AWS no GitHub. Um perfil SSO já configurado também pode ser usado.

Policy mínima para publicar a imagem no ECR (troque os placeholders):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/<ECR_REPOSITORY>"
    }
  ]
}
```

## Publicar e atualizar o servidor (PowerShell)

Instale AWS CLI v2, Docker Desktop com Buildx e OpenSSH. O exemplo supõe que seu perfil AWS pessoal se chama `zombies-io`; substitua os valores iniciais pelos seus:

```powershell
$awsProfile = "zombies-io"
$awsRegion = "us-east-1"
$accountId = "123456789012"
$ecrRepository = "zombies-io-backend"
$ec2Host = "ubuntu@SEU_HOST_OU_IP"
$sshKey = "C:\caminho\para\sua-chave.pem"
$imageTag = (git rev-parse --short HEAD)
$registry = "$accountId.dkr.ecr.$awsRegion.amazonaws.com"
$image = "$registry/$ecrRepository`:$imageTag"
```

Confirme qual identidade o perfil está usando, autentique no ECR e publique a imagem:

```powershell
aws sts get-caller-identity --profile $awsProfile
aws ecr get-login-password --profile $awsProfile --region $awsRegion |
  docker login --username AWS --password-stdin $registry
docker buildx build --platform linux/amd64 --file server/Dockerfile --tag $image --push .
```

Envie o Compose da versão atual e encaminhe um token ECR temporário pelo SSH para o login remoto e reinício do container:

```powershell
scp -i $sshKey compose.ec2.yaml "${ec2Host}:/opt/zombies-io/compose.yaml"
$ecrPassword = aws ecr get-login-password --profile $awsProfile --region $awsRegion
$remoteCommand = "docker login --username AWS --password-stdin $registry && cd /opt/zombies-io && export ECR_IMAGE='$image' && docker compose --file compose.yaml pull && docker compose --file compose.yaml up --detach --remove-orphans"
$ecrPassword | ssh -i $sshKey $ec2Host $remoteCommand
```

O token só é usado para autenticar no ECR; ele não é salvo no GitHub nem no repositório. Se o comando SSH falhar, conecte manualmente e veja `docker compose --file /opt/zombies-io/compose.yaml logs --tail 100`.

## O que continua automatizado

Cada push e pull request executa testes, builds do frontend/API e valida a imagem Docker. A publicação e atualização da EC2 são manuais, iniciadas do computador autenticado no seu perfil AWS. Para ativar deploy automático mais tarde, será necessário decidir e configurar uma identidade de deploy dedicada; isso não está habilitado neste momento.

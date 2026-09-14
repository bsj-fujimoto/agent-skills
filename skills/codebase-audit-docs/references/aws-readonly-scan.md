# AWS 無負荷・参照専用スキャン

## 安全ルール(必ず守る/顧客に明示する)
- 使うのは **コントロールプレーンの Describe/List/Get-config** と **CloudWatch GetMetricStatistics / Logs Insights** のみ。
  = 稼働中の EC2/RDS/Redis 本体にトラフィックを流さない(AWSコンソールで眺めるのと同じ負荷)。
- **やらない**: SSH/SSM接続、RDS/Redisへのデータクエリ、S3オブジェクト一覧/DL(設定メタデータのみ)、負荷試験、高頻度ポーリング。
- 呼び出しは直列・少量。メトリクスは蓄積済みを標準粒度で範囲取得。ログInsightsは**期間を絞って**スキャン量(=課金)を抑える。
- 参照専用プロファイル前提。`export AWS_PROFILE=<readonly> AWS_DEFAULT_REGION=<region>`。

## 疎通 & 権限プローブ
```
aws sts get-caller-identity
aws configure get region --profile <readonly>
# 主要サービスの読み取り可否を一括確認(AccessDenied を検出)
for s in "ec2 describe-vpcs" "elbv2 describe-load-balancers" "autoscaling describe-auto-scaling-groups" \
 "rds describe-db-instances" "elasticache describe-cache-clusters" "s3api list-buckets" \
 "cloudfront list-distributions" "route53 list-hosted-zones" "acm list-certificates" \
 "cloudwatch describe-alarms" "lambda list-functions" "sns list-topics" "sqs list-queues" \
 "sesv2 list-email-identities" "secretsmanager list-secrets" "iam list-users" \
 "ce get-cost-and-usage" ; do echo "== $s =="; eval "aws $s" 2>&1 | head -2; done
# `aws $s` と書くと zsh / fish では単語分割されず 1 引数で渡り、全部 usage エラーになる。
# 分割はシェル依存なので eval で明示する（$s の中身はこのリストのリテラルだけ）。
```
※ Cost Explorer(ce)や Performance Insights(pi)は権限外のことが多い。無ければ「実額はコード外・概算のみ」と明記。

## 棚卸し(ファイル保存して要点だけ表示)
```
A=scratchpad/aws; mkdir -p $A
aws ec2 describe-instances > $A/ec2.json
aws ec2 describe-vpcs > $A/vpcs.json; aws ec2 describe-subnets > $A/subnets.json
aws ec2 describe-route-tables > $A/rt.json; aws ec2 describe-nat-gateways > $A/nat.json
aws ec2 describe-security-groups > $A/sg.json
aws ec2 describe-volumes > $A/ebs.json; aws ec2 describe-addresses > $A/eip.json
aws elbv2 describe-load-balancers > $A/alb.json; aws elbv2 describe-target-groups > $A/tg.json
aws autoscaling describe-auto-scaling-groups > $A/asg.json
aws rds describe-db-instances > $A/rds.json
aws elasticache describe-cache-clusters --show-cache-node-info > $A/ec.json
aws s3api list-buckets > $A/s3.json; aws cloudfront list-distributions > $A/cf.json
```
確認する着眼点:
- EC2: 型/状態/AZ/VPC/サブネット/EBS最適化/監視。停止台数・命名から新旧二重稼働・残骸を検出。
- EBS: 未暗号化・未アタッチ。EIP: 未関連付け(課金)。SG: `0.0.0.0/0` の SSH(22)/SMTP(25) 開放。
- VPC: **default VPC で本番**が動いていないか。NAT が単一AZ(outbound SPOF)でないか。
- ALB/ASG: 本番Webの min/desired/**max** と実測ピーク台数(上限接近=限界)。
- RDS: Writer/Reader構成、暗号化、公開。ElastiCache: 単一ノード(SPOF)/TLS有無。
- S3/CloudFront/Route53/ACM/SES: コードの .env と突合(コード↔クラウド対応表)。

## メトリクス(過去N日, 1h粒度)
```
S=<epochSec開始>; E=<epochSec終了>
aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name RequestCount \
  --dimensions Name=LoadBalancer,Value=app/<name>/<id> --start-time $S --end-time $E --period 3600 --statistics Sum
# 同様に: TargetResponseTime(Avg/Max), HTTPCode_Target_5XX_Count(Sum), ActiveConnectionCount
# RDS: CPUUtilization / DatabaseConnections / FreeableMemory (Writer/Reader 各 DBInstanceIdentifier)
# EC2: CPUUtilization (InstanceId)  / ElastiCache: EngineCPUUtilization, DatabaseMemoryUsagePercentage
# ASG: GroupInServiceInstances / GroupDesiredCapacity (AutoScalingGroupName)
```
→ 「読みがReaderに集中して先に飽和」「Webがmaxに接近」等、**限界点を数値で**示す。

## スロークエリ分析(RDS/Aurora)
```
LG=/aws/rds/cluster/<cluster>/slowquery
# 頻度(日別) — Logs Insights
aws logs start-query --log-group-name "$LG" --start-time $S --end-time $E \
  --query-string 'filter @message like /Query_time/ | stats count() as n by bin(24h)'
# テーブル別 件数/最大秒(期間指定 = インシデント期間にも使える)
#  'filter @message like /Query_time/ | parse @message /(?i)(from|update|into)\s+`?(?<tbl>[a-z0-9_]+)`?/ \
#   | parse @message /Query_time: (?<qt>[0-9.]+)/ | stats count() as n, max(qt) as maxqt by tbl | sort n desc | limit 12'
# get-query-results で status=Complete を待って取得
```
- 生ログにSQLの**実値(PII)**が含まれる。**正規化**(IN(...)や値を ? に置換)して集計し、**実値はドキュメントに出さない**。
- 走査行(Rows_examined)から**テーブル規模**やインデックス不足(全件走査)を推定。
- **インシデント期間**で同じ集計を回し「当時どのクエリが問題だったか」を実照合(retentionがあれば数ヶ月遡れる)。

## よくある発見(チェックリスト)
- Reader飽和 / 接続過多(=RDS Proxy不在) / 索引不足の全件走査 / 全件 SELECT*・UPDATE / 行ロック競合
- default VPC本番 / EBS全未暗号 / SSH全開放 / SHA1 / TLS無効 / 単一ノード各種(Reader/Redis/NAT/バッチ)
- 停止残骸 / 未使用EIP・TG / 新旧二重稼働 / 過大インスタンス

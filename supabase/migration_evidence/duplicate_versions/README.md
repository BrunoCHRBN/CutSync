# Evidência das versões de migration colidentes

Estes quatro arquivos foram retirados de `supabase/migrations` porque seus
prefixos já pertencem às migrations canônicas `20260806000000` e
`20260807000000`, ou porque `20260811000000` reunia duas intenções diferentes.
Mantê-los no diretório executável faz o Supabase CLI interpretar migrações já
reconciliadas como pendentes.

O conteúdo original continua recuperável no histórico Git e é protegido aqui
pelos hashes SHA-256 calculados após normalizar quebras de linha para LF.

| Arquivo aposentado | Commit-fonte | SHA-256 LF | Substituto executável |
| --- | --- | --- | --- |
| `20260806000000_client_discovery_media_and_geo.sql` | `a9d5915e8823320e1b1e5d9613e15f1fab9b398c` | `F9BF2D750BC0C794396E89AEF724533184DC64E73BA7C8EE7394AA8918A91637` | `20260808041238_client_discovery_media_and_geo_reconciled.sql` |
| `20260807000000_client_favorites.sql` | `477df997d94157808da8dbb380b49aef9e1550e0` | `649D67FCBEF92AB9F614E48ACCEF39ADD5BC7A47E3D4171D147548F444210CEE` | `20260808041243_client_favorites_reconciled.sql` |
| `20260811000000_access_control_audit_hardening.sql` | `fa8ef00f014ccd64dfd6d51524e7890451ea3f06` | `9AB0460D06651FC148040FD121ABA3E95CE4071B466D8780BAD98D14A0950C3B` | `20260808041248_access_control_audit_hardening_reconciled.sql` |
| `20260811000000_appointment_price_charged_snapshot.sql` | `ac50d34dbe8121cb256ccbfdad8316f19c778d2b` | `8BB2843CF5D93DBB9A66707B7F9FA77EF1104486FDC05E2FA78816D2495C860A` | `20260808041253_appointment_price_charged_snapshot_reconciled.sql` |

Exemplo de recuperação somente para auditoria:

```powershell
git show a9d5915e8823320e1b1e5d9613e15f1fab9b398c:supabase/migrations/20260806000000_client_discovery_media_and_geo.sql
```

Não restaure esses arquivos em `supabase/migrations` e não crie uma entrada
`20260811000000` no ledger remoto. Qualquer nova correção deve receber um
timestamp único e posterior.

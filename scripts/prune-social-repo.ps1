# Remove article-only modules from the post (social) repo.
$root = Split-Path -Parent $PSScriptRoot
$remove = @(
  "backend\pipeline.py",
  "backend\steps.py",
  "backend\editorial_input.py",
  "backend\faq_schema.py",
  "backend\final_output_enforce.py",
  "backend\writing_format_enforce.py",
  "backend\writing_format_lint.py",
  "backend\context_extractor.py",
  "backend\restore_final_output.py",
  "backend\runner.py",
  "backend\prompts",
  "backend\integrations\anthropic.py",
  "backend\integrations\perplexity.py",
  "tests\test_faq_schema.py",
  "tests\test_writing_format_lint.py",
  "tests\test_editorial_notices.py",
  "atlas-ui\src\components\workspace\ContentPipelineBoard.jsx",
  "atlas-ui\src\components\workspace\ContentPipelineBoard.css",
  "atlas-ui\src\components\workspace\ManualArticleForm.jsx",
  "atlas-ui\src\components\workspace\ManualArticleForm.css",
  "atlas-ui\src\components\run\StepMatrixScreen.jsx",
  "atlas-ui\src\components\run\StepMatrixScreen.css",
  "atlas-ui\src\components\run\ArticleStepMatrix.jsx",
  "atlas-ui\src\components\run\ArticleStepMatrix.css"
)
foreach ($rel in $remove) {
  $path = Join-Path $root $rel
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "Removed $rel"
  }
}

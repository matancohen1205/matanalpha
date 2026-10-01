#!/bin/bash
# נקרא ע"י hook מסוג SessionEnd. כותב סיכום סשן בפורמט Markdown לתיקיית session-notes/.
# הקלט (stdin): JSON עם session_id, transcript_path, cwd, reason.
set -u
input="$(cat)"
sid="$(printf '%s' "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
reason="$(printf '%s' "$input" | jq -r '.reason // "other"' 2>/dev/null)"

root="$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

dir="session-notes"
mkdir -p "$dir"
stamp="$(date +%Y-%m-%d_%H%M)"
file="$dir/${stamp}_${sid:0:8}.md"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"

# נקודת התחלה: הסיכום הקודם (אם יש), אחרת 24 שעות אחורה
prev="$(ls -1t "$dir"/*.md 2>/dev/null | grep -v "$file" | head -1)"
if [ -n "$prev" ]; then since="$(date -r "$prev" '+%Y-%m-%d %H:%M:%S')"; else since="24 hours ago"; fi

{
  echo "# סיכום סשן $(date '+%d/%m/%Y %H:%M')"
  echo
  echo "- סשן: \`$sid\`"
  echo "- ענף: \`$branch\`"
  echo "- סיבת סיום: $reason"
  echo "- טווח הסיכום: מאז $since"
  echo
  echo "## מה התבקש"
  if [ -n "$transcript" ] && [ -f "$transcript" ]; then
    # הודעות משתמש אמיתיות בלבד (בלי הערות מערכת)
    msgs="$(jq -r 'select(.type=="user") | .message.content | if type=="string" then . else ([.[]? | select(.type=="text") | .text] | join(" ")) end | select(length>0 and (startswith("<")|not)) | gsub("\\s+";" ") | .[0:220]' "$transcript" 2>/dev/null | head -40)"
    if [ -n "$msgs" ]; then printf '%s\n' "$msgs" | sed 's/^/- /'; else echo "- (לא נמצאו הודעות בתמלול)"; fi
  else
    echo "- (תמלול הסשן לא זמין)"
  fi
  echo
  echo "## קומיטים בטווח"
  commits="$(git log --since="$since" --pretty='- %h %s' 2>/dev/null | head -40)"
  if [ -n "$commits" ]; then echo "$commits"; else echo "- אין קומיטים חדשים"; fi
  echo
  echo "## קבצים ששונו"
  changed="$( { git log --since="$since" --name-only --pretty=format: 2>/dev/null; git status --porcelain 2>/dev/null | cut -c4-; } | grep -v '^$' | grep -v "^$dir/" | sort -u | head -60)"
  if [ -n "$changed" ]; then printf '%s\n' "$changed" | sed 's/^/- `/; s/$/`/'; else echo "- אין"; fi
  echo
  echo "## מצב הריפו בסיום"
  unpushed="$(git log '@{u}..HEAD' --oneline 2>/dev/null | wc -l | tr -d ' ')"
  dirty="$(git status --porcelain 2>/dev/null | grep -v "$dir/" | wc -l | tr -d ' ')"
  echo "- קבצים לא שמורים בקומיט: $dirty"
  echo "- קומיטים שטרם נדחפו: ${unpushed:-0}"
  echo
  echo "_נוצר אוטומטית בסיום הסשן._"
} > "$file"

# מחזיר הודעה קצרה למשתמש
printf '{"systemMessage":"נשמר סיכום סשן: %s"}\n' "$file"

import json
from pathlib import Path
from icalendar import Calendar
records=[]
for index in range(3):
    results={}
    for variant in ["before","after"]:
        metadata=json.loads(Path(f"validation-logs/{variant}-{index}.json").read_text())
        calendar=Calendar.from_ical(Path(f"validation-logs/{variant}-{index}.ics").read_bytes())
        event=calendar.walk("VEVENT")[0]
        actual=str(event["URL"])
        assert str(event["SUMMARY"]) == metadata["summary"]
        results[variant]={"expected_url":metadata["url"],"parsed_url":actual,"matches":actual==metadata["url"]}
    assert results["after"]["matches"]
    assert results["before"]["matches"] == (index == 2)
    records.append(results)
Path("validation-logs/parser-results.json").write_text(json.dumps(records,indent=2))
print(json.dumps(records,indent=2))

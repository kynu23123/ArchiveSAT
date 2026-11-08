import json
from hashlib import sha256
from pathlib import Path

archive = Path(__file__).resolve().parents[1] / 'historical'
catalog = json.loads((archive / 'library.json').read_text(encoding='utf8'))
registry = json.loads((archive / 'scoring-registry.json').read_text(encoding='utf8'))
audit = json.loads((archive / 'authenticity.json').read_text(encoding='utf8'))
forms = {form['id']: form for form in catalog['forms']}
practice = {form['id']: form for form in catalog.get('practiceForms', [])}
assert set(forms) == set(audit['forms'])
assert set(forms) | set(practice) == set(registry)
assert any(entry['id'] == '7W' for entry in audit['excluded'])
assert all(form['title'] != 'SAT Form 7W' and id != 'dea36d1d' for id,form in forms.items())
for id, record in audit['forms'].items():
    assert record['status'] in ('verified','review','blocked')
    assert record['assetSha256'] == forms[id]['assetSha256']
    assert sha256((archive / forms[id]['asset']).read_bytes()).hexdigest() == record['assetSha256']
    assert sha256((archive / 'transcriptions' / (id+'.json')).read_bytes()).hexdigest() == record['transcriptionSha256']
    scoring = json.dumps(registry[id],sort_keys=True,separators=(',',':')).encode()
    assert sha256(scoring).hexdigest() == record['scoringSha256']
    assert registry[id]['version'] == record['scoringVersion']
    for group in ('transcription','key','scale'):
        counts = record[group]
        assert 0 <= counts['checked'] <= counts['total'], (id,group)
        if record['status'] == 'verified':
            assert counts['checked'] == counts['total'] > 0, (id,group)
    assert (record['status'] == 'verified') == (record['unresolved'] == 0), id
    if record['status'] == 'verified':
        source = next(source for source in catalog['sources'] if source['id'] == forms[id]['citations'][0]['sourceId'])
        assert record['period']['sourceSha256'] == source['sha256'], id
        assert record['period']['copyrightYears'] and max(record['period']['copyrightYears']) < 1995, id
    assert record['scoringReady'] == (record['status'] != 'blocked' and all(
        record[group]['checked'] == record[group]['total'] > 0 for group in ('key','scale')
    )), id
for id, form in practice.items():
    record = form['practiceAudit']
    resource = registry[id]
    approval = record['scoringApproval']
    assert record['status'] == 'review' and record['scoringReady']
    assert approval['status'] == 'approved' and approval['approvedBy'] == 'user'
    assert approval['assetSha256'] == record['assetSha256'] == form['assetSha256'] == resource['assetSha256']
    assert approval['scoringVersion'] == record['scoringVersion'] == resource['version']
    assert sha256((archive / form['asset']).read_bytes()).hexdigest() == form['assetSha256']
    assert sha256((archive / 'transcriptions' / (id+'.json')).read_bytes()).hexdigest() == record['transcriptionSha256']
    assert sha256(json.dumps(resource,sort_keys=True,separators=(',',':')).encode()).hexdigest() == record['scoringSha256']
    for group in ('transcription','key','scale'):
        assert record[group]['checked'] == record[group]['total'] > 0
    proof = json.loads((archive / 'unidentified-scoring-evidence.json').read_text(encoding='utf8'))[id]
    assert proof['scoringSha256'] == record['scoringSha256'] and proof['approval'] == approval
print(f'{len(forms)} authenticated and {len(practice)} user-approved packet scoring records match their audited assets. 7W remains excluded.')

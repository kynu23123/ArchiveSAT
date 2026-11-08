import base64
import io
import json
from pathlib import Path

from PIL import Image

archive = Path(__file__).resolve().parents[1] / 'historical'
catalog = json.loads((archive / 'library.json').read_text(encoding='utf8'))
forms = [*catalog['forms'], *catalog.get('practiceForms', [])]
exclusions = json.loads((archive / 'source-exclusions.json').read_text(encoding='utf8'))
total = ready = figures = omitted = 0
for form in forms:
    data = json.loads((archive/'transcriptions'/(form['id']+'.json')).read_text(encoding='utf8'))
    questions,images = data['questions'],data['images']
    cursor = 0
    used = set()
    for section in form['sections']:
        if section['index']=='TSWE':
            continue
        for n in range(1,section['count']+1):
            q = questions[cursor]
            cursor += 1
            assert q['page'] in section['pages'], (form['id'],n)
            assert bool(q.get('omitted')) == (n in exclusions.get(form['id'], {}).get(str(section['number']), [])), (form['id'],n)
            if q.get('omitted'):
                assert q == {'page':q['page'],'omitted':True}, (form['id'],n)
                omitted += 1
                continue
            assert isinstance(q.get('prompt'),str) and q['prompt'].strip(), (form['id'],n)
            context = q.get('context', [])
            assert isinstance(context, list) and all(isinstance(t,str) and t.strip() for t in context), (form['id'],n)
            choices = q['choices']
            count = 4 if section.get('fourChoice') and 8<=n<=27 else 5
            assert len(choices)==count and len(set(choices))==count, (form['id'],n,choices)
            assert all(isinstance(t,str) and t.strip() for t in choices), (form['id'],n)
            assert not any('data:image' in t or '\ufffd' in t for t in [q['prompt'],*choices,*q.get('context',[])]), (form['id'],n)
            assert not q.get('sourceIncomplete'), (form['id'],n)
            ready += 1
            if 'figure' in q:
                assert isinstance(q['figure'],int) and 0<=q['figure']<len(images), (form['id'],n)
                used.add(q['figure'])
    assert cursor==len(questions) and used==set(range(len(images))), form['id']
    total += cursor
    figures += len(images)
    for width,height,body in images:
        with Image.open(io.BytesIO(base64.b64decode(body,validate=True))) as image:
            assert image.format=='JPEG' and image.size==(width,height), form['id']
    if form['id']=='10SATs_3rd-test-3':
        assert all('prompt' in q for q in questions) and len(questions)==145
        assert questions[49]['prompt']=='In the figure above, x + y ='
        assert questions[49]['choices']==['30','45','60','90','120']
        assert questions[95]['context'][0].startswith('The land has housed us')
    if form['id']=='12365d26-test-1':
        assert all('prompt' in q for q in questions) and len(questions)==145
        assert questions[50]['page']==6 and questions[50]['choices']==['4 m','5 m','6 m','7 m','8 m']
        assert questions[109]['page']==14 and questions[109]['context'][0].startswith('Certain economists')
    if form['id']=='09451a48':
        assert all('prompt' in q for q in questions) and len(questions)==145
        assert questions[31]['context'][0].startswith('Literary study')
        assert questions[36]['context'][0].startswith('In 1816')
        assert questions[43]['choices']==['6⁄5','3⁄2','5⁄3','2','3']
    if form['id']=='12365d26-test-2':
        assert all('prompt' in q for q in questions) and len(questions)==145
        assert questions[21]['context'][0].startswith('Beowulf, the greatest')
        assert questions[25]['context'][0].startswith('Tuberculosis, measles')
        assert questions[53]['page']==6 and 'figure' in questions[53]
        assert questions[109]['context'][0].startswith('A fissionable atom')
    if form['id']=='12365d26-test-4':
        assert all('prompt' in q for q in questions) and len(questions)==145
        assert questions[63]['context']==['The d-distance of an integer M from an integer N is M − N.']
        assert questions[106]['page']==14 and questions[106]['context'][0].startswith('Confronted by an enigmatic spectacle')
    if form['id'] in ('10SATs_2nd-test-1','12365d26-test-5','12365d26-test-6','12365d26-test-10'):
        assert len(questions)==145 and all('prompt' in q for q in questions), form['id']
    if form['id']=='12365d26-test-6':
        assert questions[26]['context'][0].startswith('Archaeology, by its very nature')
        assert questions[67]['choices']==['I only','II only','III only','I and II','I and III']
        assert images[questions[67]['figure']][1]>2*images[questions[67]['figure']][0]
    if form['id']=='12365d26-test-10':
        assert questions[69]['context']==questions[70]['context'] and '−134' in questions[70]['context'][0]
        assert '[29] Terrell.' in questions[98]['context'][0]
assert omitted==6 and ready+omitted==total
assert sum(len(numbers) for sections in exclusions.values() for numbers in sections.values())==omitted
print(f'{len(forms)} forms, {ready} complete questions of {total} printed positions, {omitted} source omissions, {figures} figure assets')


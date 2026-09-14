"""Build the runtime Annex-A grammar from a local transcription directory.

The resulting grammar is checked against GB/T 33190-2016 (printed pp. 91-126).
Transcription corrections below are taken from the printed standard, not runtime
compatibility relaxations. The original Chinese explanatory comments are omitted.
Usage: python3 scripts/build-schema.py /path/to/xsd/src
"""
import pathlib,sys,xml.etree.ElementTree as ET
XS='http://www.w3.org/2001/XMLSchema'
ET.register_namespace('xs',XS)
root=ET.Element('{'+XS+'}schema',{'xmlns':'http://www.ofdspec.org/2016','targetNamespace':'http://www.ofdspec.org/2016','elementFormDefault':'qualified','attributeFormDefault':'unqualified'})
seen=set()
for path in sorted(pathlib.Path(sys.argv[1]).glob('*.xsd')):
 for child in ET.parse(path).getroot():
  if child.tag=='{'+XS+'}include':continue
  key=(child.tag,child.get('name'))
  if key in seen:raise ValueError(f'Duplicate global declaration: {key}')
  seen.add(key);root.append(child)
ns={'xs':XS}
# Printed p. 108: all five region segment forms, with their own point arities.
choice=root.find("xs:complexType[@name='CT_Region']/xs:sequence/xs:element/xs:complexType/xs:choice",ns)
move=choice.find("xs:element[@name='Move']/xs:complexType",ns)
for attr in list(move):
 if attr.get('name')!='Point1':move.remove(attr)
for index,(name,points,optional) in enumerate([('Line',1,0),('QuadraticBezier',2,0),('CubicBezier',3,2)],1):
 element=ET.Element('{'+XS+'}element',{'name':name});type_=ET.SubElement(element,'{'+XS+'}complexType')
 for i in range(1,points+1):
  attrs={'name':f'Point{i}','type':'ST_Pos'}
  if i>optional:attrs['use']='required'
  ET.SubElement(type_,'{'+XS+'}attribute',attrs)
 choice.insert(index,element)
# Printed pp. 99-100, 106-107 and 113.
for element in root.iter('{'+XS+'}element'):
 if element.get('name')=='Moive':element.set('name','Movie')
 if element.get('name')=='Apperance':element.set('name','Appearance')
 if element.get('name')=='URI':
  for attr in element.findall('xs:complexType/xs:attribute',ns):
   if attr.get('name') in ['Base','Target']:attr.attrib.pop('use',None)
root.find("xs:element[@name='Extension']",ns).set('name','Extensions')
annot=root.find("xs:element[@name='PageAnnot']/xs:complexType/xs:sequence/xs:element/xs:complexType",ns)
ET.SubElement(annot,'{'+XS+'}attribute',{'name':'Subtype','type':'xs:string'})
ET.SubElement(annot,'{'+XS+'}attribute',{'name':'Print','type':'xs:boolean','default':'true'})
# Remove non-semantic source indentation to make the generated module compact.
for element in root.iter():
 element.text=None;element.tail=None
xml=ET.tostring(root,encoding='unicode')
output=pathlib.Path(__file__).resolve().parents[1]/'src/schema.ts'
output.write_text('// Generated GB/T 33190-2016 Annex-A grammar. See scripts/build-schema.py and CONFORMANCE.md.\nexport const OFD_SCHEMA: string = '+repr(xml).replace('\\x','\\u00')+';\n')

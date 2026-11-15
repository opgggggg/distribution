import ctypes,json,sys,base64
lib=ctypes.CDLL(sys.argv[1]); r=json.load(sys.stdin)
data=bytearray(base64.b64decode(r['data'])); n=len(data); buf=(ctypes.c_uint8*n).from_buffer(data);w=r['width'];h=r['height']
if r['operation']=='grain':
 lib.adjust_grain.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_double,ctypes.c_double,ctypes.c_double,ctypes.c_uint32,ctypes.c_double,ctypes.c_double,ctypes.c_double]
 lib.adjust_grain(buf,w,h,w*4,r['amount'],r['size'],r['roughness'],r['seed'],0,0,1)
elif r['operation']=='lens':
 out=(ctypes.c_uint8*n)();lib.lens_distort.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_double];lib.lens_distort(buf,out,w,h,w*4,r['distortion']/100*.35);data=bytes(out)
elif r['operation']=='gradient-map':
 table=(ctypes.c_uint8*768)(*r['table']);lib.adjust_gradient_map(buf,w,h,w*4,table)
elif r['operation']=='noise':
 lib.noise_add.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_size_t,ctypes.c_float,ctypes.c_int,ctypes.c_int,ctypes.c_uint32]
 lib.noise_add(buf,w,h,w*4,r['strength'],0,1,r['seed'])
print(base64.b64encode(data).decode())

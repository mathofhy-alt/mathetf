from hml_generator import HMLGenerator

gen = HMLGenerator()
gen.add_problem({
    'question': '[[EQUATION:x + y = \\sqrt{3}]], [[EQUATION:xy = -3]]일 때',
    'answer_options': [],
    'explanation': ''
}, 1)
gen.add_problem({
    'question': '16. 0이 아닌 복소수 [[EQUATION:z]] 에 대하여 [[EQUATION:\\frac{|z|}{z} - \\bar{z} = (1 + \\bar{z} + \\frac{\\bar{z}}{z})i]] 를 만족시키는',
    'answer_options': [],
    'explanation': ''
}, 2)

gen.save('test_q4_q16.hml')
print("Generated test_q4_q16.hml")

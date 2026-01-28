UPDATE users 
SET role = 'admin', permissions = '{"all": true}'::jsonb 
WHERE email IN ('santossilvaluizeduardo@gmail.com', 'gutemberggg10@gmail.com');

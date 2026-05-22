import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để sửa tồn kho:'\);\s*if \(pwd === 'admin123'\) \{\s*const newQty = prompt\(`Nhập số lượng tồn mới cho \$\{item\.partId\}:`, String\(qty\)\);\s*if \(newQty !== null\) \{\s*storageService\.setInventoryQuantity\(item\.partId, selectedStageDetail, 'IN', parseFloat\(newQty\) \|\| 0, item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
`setPromptConfig({
                                            title: 'Sửa tồn kho',
                                            message: 'Nhập mật khẩu để sửa tồn kho:',
                                            isPassword: true,
                                            onConfirm: (pwd) => {
                                              if (pwd === 'admin123') {
                                                setTimeout(() => {
                                                  setPromptConfig({
                                                    title: 'Cập nhật số lượng',
                                                    message: \`Nhập số lượng tồn mới cho \$\{item.partId\}:\`,
                                                    defaultValue: String(qty),
                                                    onConfirm: (newQty) => {
                                                      storageService.setInventoryQuantity(item.partId, selectedStageDetail, 'IN', parseFloat(newQty) || 0, item.originalPartId);
                                                      refreshData();
                                                    }
                                                  });
                                                }, 100);
                                              } else {
                                                alert('Mật khẩu không chính xác!');
                                              }
                                            }
                                          })`
);

fs.writeFileSync('src/App.tsx', code);
console.log('Done replacing IN edit part');

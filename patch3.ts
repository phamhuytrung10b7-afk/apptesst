import * as fs from 'fs';

let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để sửa tồn kho lỗi:'\);\s*if \(pwd === 'admin123'\) \{\s*const newQty = prompt\(`Nhập số lượng tồn mới cho \$\{item\.partId\} \(Lỗi\):`, String\(qty\)\);\s*if \(newQty !== null\) \{\s*storageService\.setInventoryQuantity\(item\.partId, selectedStageDetail \|\| STAGES\[0\]\.id, 'DEFECT', parseFloat\(newQty\) \|\| 0, item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
`setPromptConfig({
                                            title: 'Sửa tồn kho lỗi',
                                            message: 'Nhập mật khẩu để sửa tồn kho lỗi:',
                                            isPassword: true,
                                            onConfirm: (pwd) => {
                                              if (pwd === 'admin123') {
                                                setTimeout(() => {
                                                  setPromptConfig({
                                                    title: 'Cập nhật số lượng lỗi',
                                                    message: \`Nhập số lượng tồn mới cho \$\{item.partId\} (Lỗi):\`,
                                                    defaultValue: String(qty),
                                                    onConfirm: (newQty) => {
                                                      storageService.setInventoryQuantity(item.partId, selectedStageDetail || STAGES[0].id, 'DEFECT', parseFloat(newQty) || 0, item.originalPartId);
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

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để cấu hình tồn kho:'\);\s*if \(pwd !== 'admin123'\) \{\s*if \(pwd !== null\) alert\('Mật khẩu không chính xác!'\);\s*return;\s*\}/g,
`setPromptConfig({
                          title: 'Cấu hình tồn kho',
                          message: 'Nhập mật khẩu để cấu hình tồn kho:',
                          isPassword: true,
                          onConfirm: (pwd) => {
                            if (pwd !== 'admin123') {
                              alert('Mật khẩu không chính xác!');
                              return;
                            }
                            try {
                              storageService.recordManualInbound(manualAddPart, showManualAddModal!.stageId, showManualAddModal!.location, Number(manualAddQty));
                              alert('Thêm tồn kho thành công!');
                              refreshData();
                              setShowManualAddModal(null);
                              setManualAddPart('');
                              setManualAddPartSearch('');
                              setManualAddQty('');
                            } catch (e: any) {
                              alert('Lỗi: ' + e.message);
                            }
                          }
                        });
                        return; // Prevent further execution in the old flow
`
);

// We also need to remove the remaining `try` block that the old code was executing synchronously
code = code.replace(
  /try \{\s*storageService\.recordManualInbound\(manualAddPart, showManualAddModal\.stageId, showManualAddModal\.location, Number\(manualAddQty\)\);\s*alert\('Thêm tồn kho thành công!'\);\s*refreshData\(\);\s*setShowManualAddModal\(null\);\s*setManualAddPart\(''\);\s*setManualAddPartSearch\(''\);\s*setManualAddQty\(''\);\s*\} catch \(e: any\) \{\s*alert\('Lỗi: ' \+ e\.message\);\s*\}/g,
  ''
);

fs.writeFileSync('App.tsx', code);
console.log('Replaced prompt calls 3');

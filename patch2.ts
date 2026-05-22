import * as fs from 'fs';

let code = fs.readFileSync('App.tsx', 'utf8');

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

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để xóa tồn kho:'\);\s*if \(pwd === 'admin123'\) \{\s*if \(confirm\(`Bạn có chắc chắn muốn xóa tồn kho của \$\{item\.partId\} tại \$\{STAGES\.find\(s => s\.id === selectedStageDetail\)\?\.name\} \(Kho IN\)\?`\)\) \{\s*storageService\.deleteInventoryItem\(item\.partId, selectedStageDetail, 'IN', item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
`setPromptConfig({
                                            title: 'Xóa tồn kho',
                                            message: 'Nhập mật khẩu để xóa tồn kho:',
                                            isPassword: true,
                                            onConfirm: (pwd) => {
                                              if (pwd === 'admin123') {
                                                if (confirm(\`Bạn có chắc chắn muốn xóa tồn kho của \$\{item.partId\} tại \$\{STAGES.find(s => s.id === selectedStageDetail)?.name\} (Kho IN)?\`)) {
                                                  storageService.deleteInventoryItem(item.partId, selectedStageDetail, 'IN', item.originalPartId);
                                                  refreshData();
                                                }
                                              } else {
                                                alert('Mật khẩu không chính xác!');
                                              }
                                            }
                                          })`
);

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để sửa tồn kho:'\);\s*if \(pwd === 'admin123'\) \{\s*const newQty = prompt\(`Nhập số lượng tồn mới cho \$\{item\.partId\}:`, String\(qty\)\);\s*if \(newQty !== null\) \{\s*storageService\.setInventoryQuantity\(item\.partId, selectedStageDetail, 'OUT', parseFloat\(newQty\) \|\| 0, item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
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
                                                      storageService.setInventoryQuantity(item.partId, selectedStageDetail, 'OUT', parseFloat(newQty) || 0, item.originalPartId);
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
  /const pwd = prompt\('Nhập mật khẩu để xóa tồn kho:'\);\s*if \(pwd === 'admin123'\) \{\s*if \(confirm\(`Bạn có chắc chắn muốn xóa tồn kho của \$\{item\.partId\} tại \$\{STAGES\.find\(s => s\.id === selectedStageDetail\)\?\.name\} \(Kho OUT\)\?`\)\) \{\s*storageService\.deleteInventoryItem\(item\.partId, selectedStageDetail, 'OUT', item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
`setPromptConfig({
                                            title: 'Xóa tồn kho',
                                            message: 'Nhập mật khẩu để xóa tồn kho:',
                                            isPassword: true,
                                            onConfirm: (pwd) => {
                                              if (pwd === 'admin123') {
                                                if (confirm(\`Bạn có chắc chắn muốn xóa tồn kho của \$\{item.partId\} tại \$\{STAGES.find(s => s.id === selectedStageDetail)?.name\} (Kho OUT)?\`)) {
                                                  storageService.deleteInventoryItem(item.partId, selectedStageDetail, 'OUT', item.originalPartId);
                                                  refreshData();
                                                }
                                              } else {
                                                alert('Mật khẩu không chính xác!');
                                              }
                                            }
                                          })`
);

code = code.replace(
  /const pwd = prompt\('Nhập mật khẩu để sửa tồn kho lỗi:'\);\s*if \(pwd === 'admin123'\) \{\s*const newQty = prompt\(`Nhập số lượng tồn mới cho \$\{item\.partId\} \(Lỗi\):`, String\(qty\)\);\s*if \(newQty !== null\) \{\s*storageService\.setInventoryQuantity\(item\.partId, selectedStageDetail, 'DEFECT', parseFloat\(newQty\) \|\| 0, item\.originalPartId\);\s*refreshData\(\);\s*\}\s*\} else if \(pwd !== null\) \{\s*alert\('Mật khẩu không chính xác!'\);\s*\}/g,
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
                                                      storageService.setInventoryQuantity(item.partId, selectedStageDetail, 'DEFECT', parseFloat(newQty) || 0, item.originalPartId);
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

fs.writeFileSync('App.tsx', code);
console.log('Replaced prompt calls');
